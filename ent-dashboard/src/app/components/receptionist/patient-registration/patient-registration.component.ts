import { Patient } from '../../../models/patient.model';
import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { DatePipe } from '@angular/common';
import { PatientService } from '../../../services/patient.service';
import { AuthService } from '../../../services/auth.service';

interface DateSummary {
  date: Date;
  label: string;
  count: number;
  key: string;
}

interface PaymentSummary {
  count: number;
  total: number;
}

@Component({
  selector: 'app-patient-registration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    DropdownModule,
    InputTextareaModule,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    ToastModule,
    MenuModule
  ],
  providers: [ConfirmationService, MessageService, DatePipe],
  templateUrl: './patient-registration.component.html',
  styleUrls: ['./patient-registration.component.css']
})
export class PatientRegistrationComponent implements OnInit {
  @ViewChild('dt') table!: Table;

  patients: Patient[] = [];
  dateSummaries: DateSummary[] = [];
  showAddForm = false;

  selectedDate: Date = new Date();
  menuItems: MenuItem[] = [];
  selectedPatientForMenu: Patient | null = null;

  patient: Patient = this.createDefaultPatient();

  statusOptions = [
    { label: 'Waiting', value: 'Waiting' },
    { label: 'In Consultation', value: 'In Consultation' },
    { label: 'Payment Done', value: 'Payment Done' }
  ];

  paymentModeOptions = [
    { label: 'Cash', value: 'Cash' },
    { label: 'QR', value: 'QR' }
  ];

  constructor(
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private patientService: PatientService,
    private datePipe: DatePipe,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.loadDateSummaries();
    this.loadPatientsForSelectedDate();
  }

  private createDefaultPatient(): Patient {
    return {
      id: 0,
      name: '',
      mobile: '',
      age: 0,
      gender: '',
      visitReason: '',
      status: 'Waiting',
      paymentMode: 'QR',
      latestVisitDate: '',
      consultationFee: 500
    };
  }

  toggleAddForm() {
    this.showAddForm = !this.showAddForm;
    if (this.showAddForm) {
      this.patient = this.createDefaultPatient();
      this.patientService.getNextToken().subscribe({
        next: (res) => {
          this.patient.tokenNumber = res.nextToken;
        },
        error: (err) => console.error("Error fetching token", err)
      });
    }
  }

  onDateChange() {
    this.loadPatientsForSelectedDate();
    this.ensureSelectedDateSummary();
  }

  selectDate(date: Date) {
    this.selectedDate = new Date(date);
    this.loadPatientsForSelectedDate();
    this.ensureSelectedDateSummary();
  }

  private loadDateSummaries(): void {
    this.patientService.getPatientDateSummaries().subscribe({
      next: (summaries) => {
        this.dateSummaries = summaries
          .map(item => {
            const parsedDate = this.toLocalDate(item.date);
            return {
              date: parsedDate,
              label: this.datePipe.transform(parsedDate, 'dd MMM') || item.date,
              count: Number(item.count) || 0,
              key: item.date
            };
          })
          .sort((left, right) => right.date.getTime() - left.date.getTime());

        this.ensureSelectedDateSummary();
      },
      error: (err) => {
        console.error('Error fetching patient date summaries', err);
      }
    });
  }

  private loadPatientsForSelectedDate(): void {
    const selectedDateKey = this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd');
    if (!selectedDateKey) {
      this.patients = [];
      return;
    }

    this.patientService.getPatientsByDate(selectedDateKey).subscribe({
      next: (patients: Patient[]) => {
        this.patients = patients.map(patient => ({
          ...patient,
          paymentMode: patient.paymentMode || 'QR'
        }));
        this.ensureSelectedDateSummary();
      },
      error: (err) => {
        console.error('Error fetching patients for date', err);
      }
    });
  }

  private ensureSelectedDateSummary(): void {
    const selectedDateKey = this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd');
    if (!selectedDateKey) {
      return;
    }

    const selectedDate = new Date(this.selectedDate);
    const existingIndex = this.dateSummaries.findIndex(item => item.key === selectedDateKey);
    if (existingIndex === -1) {
      this.dateSummaries = [
        ...this.dateSummaries,
        {
          date: selectedDate,
          label: this.datePipe.transform(selectedDate, 'dd MMM') || selectedDateKey,
          count: 0,
          key: selectedDateKey
        }
      ];
    }

    const selectedEntry = this.dateSummaries.find(item => item.key === selectedDateKey);
    const sortedSummaries = [...this.dateSummaries]
      .sort((left, right) => right.date.getTime() - left.date.getTime());

    if (sortedSummaries.length <= 30 || !selectedEntry) {
      this.dateSummaries = sortedSummaries.slice(0, 30);
      return;
    }

    const trimmedSummaries = sortedSummaries.slice(0, 30);
    if (!trimmedSummaries.some(item => item.key === selectedDateKey)) {
      trimmedSummaries[trimmedSummaries.length - 1] = selectedEntry;
      trimmedSummaries.sort((left, right) => right.date.getTime() - left.date.getTime());
    }

    this.dateSummaries = trimmedSummaries;
  }

  private toLocalDate(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00`);
  }

  isSelectedDate(date: Date): boolean {
    const selectedDateStr = this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd');
    const currentDateStr = this.datePipe.transform(date, 'yyyy-MM-dd');
    return selectedDateStr === currentDateStr;
  }

  showMenu(menu: any, event: any, patient: Patient) {
    this.selectedPatientForMenu = patient;
    const isToday = this.isToday(this.selectedDate);
    const isPaid = patient.status === 'Payment Done';

    // Get current user role
    const user = this.authService.currentUserValue;
    const isRestricted = user?.role === 'receptionist';

    // If restricted (receptionist), follow rules. Else (Admin/Doctor), allow all.
    const canEdit = !isRestricted || (isToday && !isPaid);
    const canDelete = !isRestricted || !isPaid;

    this.menuItems = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        disabled: !canEdit,
        command: () => this.initEdit(patient)
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        disabled: !canDelete,
        command: () => this.confirmDelete(patient)
      }
    ];

    menu.toggle(event);
  }

  initEdit(patient: Patient) {
    this.table.initRowEdit(patient);
  }

  onRowClick(patient: Patient, event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select, a, p-dropdown, p-calendar, .p-dropdown, .p-inputtext')) {
      return;
    }

    this.initEdit(patient);
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  get qrSummary(): PaymentSummary {
    return this.getPaymentSummary(['QR']);
  }

  get cashSummary(): PaymentSummary {
    return this.getPaymentSummary(['Cash']);
  }

  private getPaymentSummary(modes: Array<'QR' | 'Cash'>): PaymentSummary {
    const allowedModes = new Set(modes);

    return this.patients.reduce((summary, patient) => {
      if (patient.status !== 'Payment Done') {
        return summary;
      }

      const mode = this.normalizePaymentMode(patient.paymentMode);
      if (!allowedModes.has(mode)) {
        return summary;
      }

      return {
        count: summary.count + 1,
        total: summary.total + Number(patient.consultationFee || 0)
      };
    }, { count: 0, total: 0 });
  }

  private normalizePaymentMode(paymentMode?: string | null): 'QR' | 'Cash' {
    return paymentMode === 'Cash' ? 'Cash' : 'QR';
  }

  onSubmit() {
    this.patientService.createPatient(this.patient).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Patient Added',
          detail: `${this.patient.name} added successfully.`,
        });
        this.patient = this.createDefaultPatient();
        this.showAddForm = false;
        this.loadDateSummaries();
        this.loadPatientsForSelectedDate();
      },
      error: (err) => {
        console.error(err);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add patient' });
      }
    });
  }

  confirmDelete(patient: Patient) {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete ${patient.name}?`,
      header: 'Confirm Deletion',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deletePatient(patient);
      },
    });
  }

  onRowSave(p: Patient) {
    if (p.id) {
        this.patientService.updatePatient(p).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Patient updated' });
          this.loadPatientsForSelectedDate(); // Refresh selected day only
        },
        error: () => {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed' });
        }
      });
    }
  }

  onRowCancel(p: Patient, ri: number) {
    console.log("Row edit canceled:", p, "index:", ri);
  }

  deletePatient(patient: Patient) {
    this.patientService.deletePatient(patient.id!).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'info',
          summary: 'Patient Deleted',
          detail: `${patient.name} has been removed.`,
        });
        this.loadDateSummaries();
        this.loadPatientsForSelectedDate();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete patient' });
      }
    });
  }

  confirmPayment(patient: Patient) {
    this.confirmationService.confirm({
      message: `Confirm payment for ${patient.name}? This will update status to 'Payment Done'.`,
      header: 'Confirm Payment',
      icon: 'pi pi-wallet',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => {
        this.processPayment(patient);
      }
    });
  }

  processPayment(patient: Patient) {
    this.patientService.updateStatus(patient.id!, 'Payment Done').subscribe({
      next: () => {
        patient.status = 'Payment Done';
        this.patients = this.patients.map(item =>
          item.id === patient.id ? { ...item, status: 'Payment Done' } : item
        );
        this.messageService.add({
          severity: 'success',
          summary: 'Payment Confirmed',
          detail: `Payment received for ${patient.name}.`
        });
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update payment status' });
      }
    });
  }
}

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
import { User } from '../../../models/user.model';

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
  defaultConsultationFee = 500;
  assignedDoctorName = 'Doctor not assigned';
  patientCodeLookup = '';
  loadingPatientCode = false;

  patient: Patient = this.createDefaultPatient();

  statusOptions = [
    { label: 'Waiting', value: 'Waiting' },
    { label: 'In Consultation', value: 'In Consultation' },
    { label: 'Payment Done', value: 'Payment Done' },
    { label: 'Exited', value: 'Exited' }
  ];

  paymentModeOptions = [
    { label: 'Cash', value: 'Cash' },
    { label: 'QR', value: 'QR' }
  ];

  genderOptions = [
    { label: 'Male', value: 'Male' },
    { label: 'Female', value: 'Female' },
    { label: 'Other', value: 'Other' }
  ];

  constructor(
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private patientService: PatientService,
    private datePipe: DatePipe,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.loadDefaultConsultationFee();
    this.loadDateSummaries();
    this.loadPatientsForSelectedDate();
  }

  private loadDefaultConsultationFee(): void {
    const currentUser = this.authService.currentUserValue;
    this.authService.getUsers().subscribe({
      next: (users) => {
        const freshCurrentUser = users.find(user => user.id === currentUser?.id) || currentUser;
        const doctor = this.resolveCurrentDoctor(users, freshCurrentUser);
        const fee = this.parseDefaultConsultationFee(doctor?.defaultConsultationFee);
        this.defaultConsultationFee = fee || 500;
        this.assignedDoctorName = doctor?.fullName || 'Doctor not assigned';
        if (!this.showAddForm || !this.patient.consultationFee || Number(this.patient.consultationFee) === 500) {
          this.patient.consultationFee = this.defaultConsultationFee;
        }
      },
      error: (err) => console.error('Failed to load default consultation fee', err)
    });
  }

  private resolveCurrentDoctor(users: User[], currentUser: User | null): User | undefined {
    if (currentUser?.role === 'doctor') {
      return users.find(user => user.id === currentUser.id && user.role === 'doctor');
    }

    if (currentUser?.assignedDoctorId) {
      return users.find(user => user.id === currentUser.assignedDoctorId && user.role === 'doctor');
    }

    return users.find(user => user.role === 'doctor');
  }

  private parseDefaultConsultationFee(value: User['defaultConsultationFee']): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const fee = Number(value);
    return Number.isFinite(fee) && fee > 0 ? fee : null;
  }

  private createDefaultPatient(): Patient {
    return {
      id: 0,
      patientCode: '',
      name: '',
      mobile: '',
      age: 0,
      gender: '',
      visitReason: '',
      status: 'Waiting',
      paymentMode: 'QR',
      latestVisitDate: '',
      consultationFee: this.defaultConsultationFee
    };
  }

  toggleAddForm() {
    if (this.showAddForm) {
      this.closeAddForm();
      return;
    }

    this.openAddPatient();
  }

  openAddPatient(): void {
    const patientCode = this.normalizePatientCode(this.patientCodeLookup);
    if (patientCode) {
      this.loadPatientByCode(patientCode);
      return;
    }

    this.openBlankPatientForm();
  }

  private closeAddForm(): void {
    this.showAddForm = false;
    this.patient = this.createDefaultPatient();
  }

  private openBlankPatientForm(): void {
    this.showAddForm = true;
    this.patient = this.createDefaultPatient();
    this.patient.latestVisitDate = this.getSelectedDateKey();
    this.assignNextToken();
  }

  private loadPatientByCode(patientCode: string): void {
    this.loadingPatientCode = true;
    this.patientService.getPatientByCode(patientCode).subscribe({
      next: (patient) => {
        this.showAddForm = true;
        this.patient = {
          ...patient,
          patientCode: patient.patientCode || patientCode,
          status: 'Waiting',
          paymentMode: patient.paymentMode || 'QR',
          consultationFee: this.defaultConsultationFee,
          latestVisitDate: this.getSelectedDateKey() || patient.latestVisitDate || ''
        };
        this.assignNextToken();
        this.loadingPatientCode = false;
        this.messageService.add({
          severity: 'success',
          summary: 'Patient Loaded',
          detail: `${patient.name} loaded for today's visit.`
        });
      },
      error: (err) => {
        this.loadingPatientCode = false;
        this.messageService.add({
          severity: 'warn',
          summary: 'Patient Not Found',
          detail: err.error?.message || 'No patient found for this Patient ID.'
        });
      }
    });
  }

  private assignNextToken(): void {
    this.patientService.getNextToken(this.getSelectedDateKey()).subscribe({
      next: (res) => {
        this.patient.tokenNumber = res.nextToken;
      },
      error: (err) => console.error("Error fetching token", err)
    });
  }

  private normalizePatientCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private getSelectedDateKey(): string {
    return this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd') || '';
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
          paymentMode: patient.status === 'Exited' ? null : (patient.paymentMode || 'QR')
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

    const user = this.authService.currentUserValue;
    const isRestricted = user?.role === 'receptionist';
    const canDelete = user?.role === 'admin' || user?.role === 'doctor';

    // If restricted (receptionist), follow rules. Else (Admin/Doctor), allow all.
    const canEdit = !isRestricted || (isToday && !isPaid);

    this.menuItems = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        disabled: !canEdit,
        command: () => this.initEdit(patient)
      }
    ];

    if (canDelete) {
      this.menuItems.push({
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => this.confirmDelete(patient)
      });
    }

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

  onStatusChange(patient: Patient): void {
    if (patient.status === 'Exited') {
      patient.paymentMode = null;
      return;
    }

    if (!patient.paymentMode) {
      patient.paymentMode = 'QR';
    }
  }

  getPaymentModeLabel(patient: Patient): string {
    if (patient.status === 'Exited' || !patient.paymentMode) {
      return '-';
    }

    return patient.paymentMode;
  }

  getPaymentModeClass(patient: Patient): Record<string, boolean> {
    return {
      'bg-blue-100 text-blue-800': patient.paymentMode === 'QR' && patient.status !== 'Exited',
      'bg-orange-100 text-orange-800': patient.paymentMode === 'Cash' && patient.status !== 'Exited',
      'bg-slate-100 text-slate-500': patient.status === 'Exited' || !patient.paymentMode
    };
  }

  private isValidMobile(mobile?: string | null): boolean {
    const value = String(mobile || '').trim();
    return !value || /^[0-9]{10}$/.test(value);
  }

  private isValidAge(age?: number | null): boolean {
    if (age === null || age === undefined || String(age).trim() === '') {
      return true;
    }

    const value = Number(age);
    return Number.isFinite(value) && value >= 0 && value < 100;
  }

  isPatientBasicsValid(patient: Patient): boolean {
    return this.isValidMobile(patient.mobile) && this.isValidAge(patient.age);
  }

  isMobileValid(mobile?: string | null): boolean {
    return this.isValidMobile(mobile);
  }

  isAgeValid(age?: number | null): boolean {
    return this.isValidAge(age);
  }

  private validatePatientBasics(patient: Patient): boolean {
    if (!this.isValidMobile(patient.mobile)) {
      this.messageService.add({
        severity: 'error',
        summary: 'Invalid Mobile',
        detail: 'Enter a valid 10-digit mobile number.'
      });
      return false;
    }

    if (!this.isValidAge(patient.age)) {
      this.messageService.add({
        severity: 'error',
        summary: 'Invalid Age',
        detail: 'Age should be below 100.'
      });
      return false;
    }

    return true;
  }

  onSubmit() {
    if (!this.validatePatientBasics(this.patient)) {
      return;
    }

    this.onStatusChange(this.patient);
    this.patient.latestVisitDate = this.getSelectedDateKey();

    const saveRequest = this.patient.id && this.patient.id > 0
      ? this.patientService.registerPatientVisit(this.patient)
      : this.patientService.createPatient(this.patient);

    saveRequest.subscribe({
      next: (result) => {
        const patientCode = result?.patientCode || this.patient.patientCode;
        this.messageService.add({
          severity: 'success',
          summary: this.patient.id && this.patient.id > 0 ? 'Visit Added' : 'Patient Added',
          detail: patientCode
            ? `${this.patient.name} saved successfully. Patient ID: ${patientCode}`
            : `${this.patient.name} saved successfully.`,
        });
        this.patient = this.createDefaultPatient();
        this.patientCodeLookup = '';
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
    if (!this.validatePatientBasics(p)) {
      return;
    }

    this.onStatusChange(p);
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
    const role = this.authService.currentUserValue?.role;
    this.patientService.deletePatient(patient.id!, this.getSelectedDateKey(), role).subscribe({
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
    if (patient.status === 'Exited') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Patient Exited',
        detail: 'Exited patients cannot be marked as paid.'
      });
      return;
    }

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

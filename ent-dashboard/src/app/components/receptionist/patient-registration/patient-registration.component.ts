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
import { CalendarModule } from 'primeng/calendar';
import { DatePipe } from '@angular/common';
import { PatientService } from '../../../services/patient.service';
import { AuthService } from '../../../services/auth.service';


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
    MenuModule,
    CalendarModule
  ],
  providers: [ConfirmationService, MessageService, DatePipe],
  templateUrl: './patient-registration.component.html',
  styleUrls: ['./patient-registration.component.css']
})
export class PatientRegistrationComponent implements OnInit {
  @ViewChild('dt') table!: Table;

  allPatients: Patient[] = [];
  patients: Patient[] = [];
  showAddForm = false;

  selectedDate: Date = new Date();
  menuItems: MenuItem[] = [];
  selectedPatientForMenu: Patient | null = null;

  patient: Patient = {
    id: 0,
    name: '',
    mobile: '',
    age: 0,
    gender: '',
    visitReason: '',
    status: 'Waiting',
    latestVisitDate: '',
    consultationFee: 0
  };

  statusOptions = [
    { label: 'Waiting', value: 'Waiting' },
    { label: 'In Consultation', value: 'In Consultation' },
    { label: 'Payment Done', value: 'Payment Done' }
  ];

  constructor(
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private patientService: PatientService,
    private datePipe: DatePipe,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.loadPatients();
  }

  toggleAddForm() {
    this.showAddForm = !this.showAddForm;
    if (this.showAddForm) {
      this.patientService.getNextToken().subscribe({
        next: (res) => {
          this.patient.tokenNumber = res.nextToken;
        },
        error: (err) => console.error("Error fetching token", err)
      });
    }
  }

  loadPatients() {
    console.log("Loading patients...");
    this.patientService.getTodaysPatients().subscribe({
      next: (patients: Patient[]) => {
        console.log('Fetched patients:', patients);
        this.allPatients = patients;
        this.filterPatientsByDate();
      },
      error: (err) => {
        console.error("Error fetching patients", err);
      }
    });
  }

  filterPatientsByDate() {
    if (!this.selectedDate) {
      this.patients = this.allPatients;
      return;
    }

    const selectedDateStr = this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd');

    this.patients = this.allPatients.filter(p => {
      if (!p.latestVisitDate) return false;
      const vDate = new Date(p.latestVisitDate);
      const visitDateStr = this.datePipe.transform(vDate, 'yyyy-MM-dd');
      console.log(`Patient: ${p.name}, Date: ${p.latestVisitDate}, Formatted: ${visitDateStr}, Selected: ${selectedDateStr}`);
      return visitDateStr === selectedDateStr;
    });
  }

  onDateChange() {
    this.filterPatientsByDate();
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

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  onSubmit() {
    this.patientService.createPatient(this.patient).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Patient Added',
          detail: `${this.patient.name} added successfully.`,
        });
        this.patient = { id: 0, name: '', mobile: '', age: 0, gender: '', visitReason: '', consultationFee: 0 };
        this.showAddForm = false;
        this.loadPatients();
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
          this.loadPatients(); // Refresh list
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
        this.loadPatients();
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
        this.messageService.add({
          severity: 'success',
          summary: 'Payment Confirmed',
          detail: `Payment received for ${patient.name}.`
        });
        this.loadPatients();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update payment status' });
      }
    });
  }
}

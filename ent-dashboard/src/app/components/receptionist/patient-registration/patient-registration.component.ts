import { Patient } from '../../../models/patient.model';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { RadioButtonModule } from 'primeng/radiobutton';
import { CalendarModule } from 'primeng/calendar';
import { ConfirmationService, MessageService } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { DatePipe } from '@angular/common';
import { PatientService } from '../../../services/patient.service';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RealtimeEvent, RealtimeService } from '../../../services/realtime.service';

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
    InputTextModule,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    ToastModule,
    DialogModule,
    RadioButtonModule,
    CalendarModule,
    MenuModule
  ],
  providers: [ConfirmationService, MessageService, DatePipe],
  templateUrl: './patient-registration.component.html',
  styleUrls: ['./patient-registration.component.css']
})
export class PatientRegistrationComponent implements OnInit, OnDestroy {
  @ViewChild('dt') table!: Table;
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

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
  mobileMatches: Patient[] = [];
  showPatientSelectDialog = false;
  paymentDialogVisible = false;
  paymentPatient: Patient | null = null;
  selectedPaymentMode: 'QR' | 'Cash' = 'QR';
  paymentFee = 0;
  isPrintingPrescription = false;
  private realtimeSubscription?: Subscription;

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
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private realtimeService: RealtimeService
  ) { }

  ngOnInit() {
    const selectedDateParam = this.route.snapshot.queryParamMap.get('date');
    if (selectedDateParam) {
      this.selectedDate = this.toLocalDate(selectedDateParam);
    }

    this.loadDefaultConsultationFee();
    this.loadDateSummaries();
    this.loadPatientsForSelectedDate();
    this.realtimeSubscription = this.realtimeService.connect().subscribe(event => this.handleRealtimeEvent(event));
  }

  ngOnDestroy(): void {
    this.realtimeSubscription?.unsubscribe();
  }

  private handleRealtimeEvent(event: RealtimeEvent): void {
    if (!['patient-changed', 'prescription-changed'].includes(event.type)) {
      return;
    }

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
    const lookupValue = this.patientCodeLookup.trim();
    if (lookupValue) {
      if (/^[0-9]{10}$/.test(lookupValue)) {
        this.loadPatientsByMobile(lookupValue);
      } else if (this.isPatientCodeLookup(lookupValue)) {
        this.loadPatientByCode(this.normalizePatientCode(lookupValue));
      } else {
        this.loadPatientsByName(lookupValue);
      }
      return;
    }

    this.openBlankPatientForm();
  }

  private closeAddForm(): void {
    this.showAddForm = false;
    this.patient = this.createDefaultPatient();
  }

  private openBlankPatientForm(mobile = '', name = ''): void {
    this.showAddForm = true;
    this.patient = this.createDefaultPatient();
    this.patient.mobile = mobile;
    this.patient.name = name;
    this.patient.latestVisitDate = this.getSelectedDateKey();
    this.assignNextToken();
    this.focusNameInput();
  }

  private loadPatientByCode(patientCode: string): void {
    this.loadingPatientCode = true;
    this.patientService.getPatientByCode(patientCode).subscribe({
      next: (patient) => {
        this.loadingPatientCode = false;
        this.loadExistingPatientForVisit(patient, patientCode);
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

  private loadPatientsByMobile(mobile: string): void {
    this.loadingPatientCode = true;
    this.patientService.getPatientsByMobile(mobile).subscribe({
      next: (patients) => {
        this.loadingPatientCode = false;

        if (patients.length === 0) {
          this.openBlankPatientForm(mobile);
          return;
        }

        if (patients.length === 1) {
          this.loadExistingPatientForVisit(patients[0], patients[0].patientCode || '');
          return;
        }

        this.mobileMatches = patients;
        this.showPatientSelectDialog = true;
      },
      error: (err) => {
        this.loadingPatientCode = false;
        if (err.status === 404) {
          this.openBlankPatientForm(mobile);
          return;
        }

        this.messageService.add({
          severity: 'error',
          summary: 'Lookup Failed',
          detail: err.error?.message || 'Unable to search this mobile number.'
        });
      }
    });
  }

  private loadPatientsByName(name: string): void {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      this.openBlankPatientForm('', normalizedName);
      return;
    }

    this.loadingPatientCode = true;
    this.patientService.getPatientsByName(normalizedName).subscribe({
      next: (patients) => {
        this.loadingPatientCode = false;

        if (patients.length === 0) {
          this.openBlankPatientForm('', normalizedName);
          return;
        }

        if (patients.length === 1) {
          this.loadExistingPatientForVisit(patients[0], patients[0].patientCode || '');
          return;
        }

        this.mobileMatches = patients;
        this.showPatientSelectDialog = true;
      },
      error: (err) => {
        this.loadingPatientCode = false;
        if (err.status === 404) {
          this.openBlankPatientForm('', normalizedName);
          return;
        }

        this.messageService.add({
          severity: 'error',
          summary: 'Lookup Failed',
          detail: err.error?.message || 'Unable to search this name.'
        });
      }
    });
  }

  selectMobilePatient(patient: Patient): void {
    this.showPatientSelectDialog = false;
    this.mobileMatches = [];
    this.loadExistingPatientForVisit(patient, patient.patientCode || '');
  }

  private loadExistingPatientForVisit(patient: Patient, patientCode: string): void {
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
    this.focusNameInput();
    this.messageService.add({
      severity: 'success',
      summary: 'Patient Loaded',
      detail: `${patient.name} loaded for selected visit date.`
    });
  }

  private focusNameInput(): void {
    setTimeout(() => this.nameInput?.nativeElement?.focus(), 0);
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

  private isPatientCodeLookup(value: string): boolean {
    return /^PT[0-9A-Z-]*$/i.test(value.trim()) || /^[0-9]{1,9}$/.test(value.trim());
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

  hasPrintablePrescription(patient: Patient): boolean {
    if (Number(patient.prescriptionMedicineCount || 0) > 0) {
      return true;
    }

    return (patient.prescriptions || []).some(prescription =>
      (prescription.medicines || []).some(medicine => String(medicine.medicineName || '').trim().length > 0)
    );
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

  submitPatientForm(form: NgForm, event?: Event): void {
    event?.preventDefault();

    if (form.valid) {
      this.onSubmit();
    }
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

  saveEditedRowOnEnter(p: Patient, editing: boolean, rowElement: HTMLTableRowElement, event: Event): void {
    if (!editing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!this.validatePatientBasics(p)) {
      return;
    }

    this.table.saveRowEdit(p, rowElement);
    this.onRowSave(p);
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

    this.paymentPatient = patient;
    this.selectedPaymentMode = this.normalizePaymentMode(patient.paymentMode);
    this.paymentFee = Number(patient.consultationFee || this.defaultConsultationFee || 0);
    this.paymentDialogVisible = true;
  }

  confirmPaymentDialog(): void {
    if (!this.paymentPatient) {
      return;
    }

    const fee = Number(this.paymentFee);
    if (!Number.isFinite(fee) || fee < 0) {
      this.messageService.add({
        severity: 'error',
        summary: 'Invalid Fee',
        detail: 'Enter a valid consultation fee.'
      });
      return;
    }

    this.processPayment(this.paymentPatient, this.selectedPaymentMode, fee);
  }

  processPayment(patient: Patient, paymentMode: 'QR' | 'Cash' = 'QR', consultationFee = Number(patient.consultationFee || 0)) {
    const updatedPatient: Patient = {
      ...patient,
      status: 'Payment Done',
      paymentMode,
      consultationFee
    };

    this.patientService.updatePatient(updatedPatient).subscribe({
      next: () => {
        patient.status = 'Payment Done';
        patient.paymentMode = paymentMode;
        patient.consultationFee = consultationFee;
        this.patients = this.patients.map(item =>
          item.id === patient.id ? { ...item, status: 'Payment Done', paymentMode, consultationFee } : item
        );
        this.paymentDialogVisible = false;
        this.paymentPatient = null;
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

  printPrescription(patient: Patient): void {
    if (!patient.id) {
      return;
    }

    this.router.navigate(['/billing'], {
      queryParams: {
        patientId: patient.id,
        autoprint: 1,
        returnTo: 'reception',
        returnDate: this.getSelectedDateKey()
      }
    });
  }
}

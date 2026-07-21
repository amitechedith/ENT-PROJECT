import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { DoctorDataService } from '../../../services/doctor-data.service';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-billing-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CalendarModule],
  providers: [DatePipe],
  templateUrl: './billing-page.component.html'
})
export class BillingPageComponent implements OnInit, OnDestroy {
  allPatients: any[] = [];
  displayedPatients: any[] = [];
  selectedPatient: any; // The patient to print
  selectedDate: Date = new Date();
  today: Date = new Date();
  doctorProfile: User | null = null;
  private pendingPatientId: number | null = null;
  private loadedPrescriptionPatientIds = new Set<number>();
  private shouldAutoPrint = false;
  private hasAutoPrinted = false;
  private printReturnTo = '';
  private printReturnDate = '';
  private printReturnPatientId: number | null = null;
  private printReturnTimer?: number;
  private printMessageHandler?: (event: MessageEvent) => void;

  constructor(
    private doctorData: DoctorDataService,
    private authService: AuthService,
    private datePipe: DatePipe,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit() {
    const patientIdParam = this.route.snapshot.queryParamMap.get('patientId');
    const patientId = Number(patientIdParam);
    this.pendingPatientId = Number.isFinite(patientId) && patientId > 0 ? patientId : null;
    this.shouldAutoPrint = this.route.snapshot.queryParamMap.get('autoprint') === '1';
    this.printReturnTo = this.route.snapshot.queryParamMap.get('returnTo') || '';
    this.printReturnDate = this.route.snapshot.queryParamMap.get('returnDate') || '';
    this.printReturnPatientId = this.pendingPatientId;

    this.loadDoctorProfile();
    this.bootstrapPatients();
  }

  ngOnDestroy(): void {
    this.clearPrintReturnWatch();
  }

  loadDoctorProfile() {
    const currentUser = this.authService.currentUserValue;
    this.authService.getUsers().subscribe({
      next: (users) => {
        this.doctorProfile = this.resolveCurrentDoctor(users, currentUser) || null;
      },
      error: (err) => console.error('Failed to load doctor profile', err)
    });
  }

  private resolveCurrentDoctor(users: User[], currentUser: User | null): User | undefined {
    if (currentUser?.role === 'doctor') {
      return users.find(user => user.id === currentUser.id && user.role === 'doctor');
    }

    if (currentUser?.assignedDoctorId) {
      return users.find(user => user.id === currentUser.assignedDoctorId && user.role === 'doctor');
    }

    const doctors = users.filter(user => user.role === 'doctor');
    return doctors.find(user =>
      !!user.doctorTitle &&
      !!user.doctorRegistrationNumber &&
      !!user.doctorClinicAddress &&
      !!user.doctorClinicPhone &&
      !!user.doctorTimings
    ) || doctors[0];
  }

  bootstrapPatients() {
    if (this.pendingPatientId) {
      this.doctorData.getPatientById(this.pendingPatientId).subscribe({
        next: (patient) => {
          if (patient?.latestVisitDate) {
            this.selectedDate = this.toLocalDate(patient.latestVisitDate);
          }
          this.loadPatientsForSelectedDate(patient?.id ?? null);
        },
        error: (err) => {
          console.error('Failed to load target patient', err);
          this.loadPatientsForSelectedDate();
        }
      });
      return;
    }

    this.loadPatientsForSelectedDate();
  }

  private getSelectedDateKey(): string {
    return this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd') || '';
  }

  private toLocalDate(dateValue: string | Date): Date {
    if (dateValue instanceof Date) {
      return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
    }

    const normalized = String(dateValue).trim().split('T')[0];
    return new Date(`${normalized}T00:00:00`);
  }

  loadPatientsForSelectedDate(preselectPatientId: number | null = null) {
    const selectedDateKey = this.getSelectedDateKey();
    if (!selectedDateKey) {
      this.displayedPatients = [];
      this.selectedPatient = undefined;
      return;
    }

    this.loadedPrescriptionPatientIds.clear();
    this.doctorData.getPatientsByDate(selectedDateKey).subscribe({
      next: (patients) => {
        this.allPatients = patients;
        this.displayedPatients = patients;

        if (preselectPatientId) {
          const targetPatient = this.displayedPatients.find(patient => patient.id === preselectPatientId);
          if (targetPatient) {
            this.selectPatient(targetPatient);
            this.pendingPatientId = null;
            return;
          }
        }

        this.applyAutoSelection();
      },
      error: (err) => console.error('Failed to load patients', err)
    });
  }

  onDateChange() {
    this.selectedPatient = undefined;
    this.loadPatientsForSelectedDate();
  }

  selectPatient(patient: any) {
    this.selectedPatient = patient;
    this.updatePatientQueryParam(patient?.id);

    if (patient?.id && this.loadedPrescriptionPatientIds.has(patient.id)) {
      this.pendingPatientId = null;
      return;
    }

    this.loadPatientPrescriptions(patient);
  }

  private updatePatientQueryParam(patientId?: number): void {
    if (!patientId) {
      return;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { patientId },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private applyAutoSelection(): void {
    if (this.displayedPatients.length === 0) {
      this.selectedPatient = undefined;
      return;
    }

    const paymentDonePatient = this.displayedPatients.find(patient => patient.status === 'Payment Done');
    if (paymentDonePatient) {
      this.selectPatient(paymentDonePatient);
      return;
    }

    this.selectPatient(this.displayedPatients[0]);
  }

  private loadPatientPrescriptions(patient: any): void {
    if (!patient?.id) {
      this.pendingPatientId = null;
      return;
    }

    this.doctorData.getPatientPrescriptions(patient.id).subscribe({
      next: (prescriptions) => {
        patient.prescriptions = (prescriptions || []).map(prescription => ({
          ...prescription,
          medicines: (prescription.medicines || []).map((medicine: any) => ({
            ...medicine,
            daysToTake: this.getMedicineDays(medicine)
          }))
        }));
        this.loadedPrescriptionPatientIds.add(patient.id);
        this.pendingPatientId = null;
        this.selectedPatient = patient;
        this.printIfRequested();
      },
      error: (err) => {
        console.error('Failed to load prescriptions', err);
        patient.prescriptions = patient.prescriptions || [];
        this.loadedPrescriptionPatientIds.add(patient.id);
        this.pendingPatientId = null;
        this.selectedPatient = patient;
        this.printIfRequested();
      }
    });
  }

  private printIfRequested(): void {
    if (!this.shouldAutoPrint || this.hasAutoPrinted) {
      return;
    }

    this.hasAutoPrinted = true;
    setTimeout(() => this.printRx(), 350);
  }

  get activePrescription(): any | undefined {
    if (!this.selectedPatient?.prescriptions?.length) {
      return undefined;
    }

    const selectedDateKey = this.getSelectedDateKey();
    return this.selectedPatient.prescriptions.find((prescription: any) =>
      String(prescription.date).startsWith(selectedDateKey)
    ) || this.selectedPatient.prescriptions[0];
  }

  get hasActivePrescriptionMedicines(): boolean {
    return !!this.activePrescription?.medicines?.length;
  }

  printRx() {
    const printContent = document.getElementById('billing-container');
    const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=900,toolbar=0,scrollbars=0,status=0');

    if (WindowPrt && printContent) {
      this.watchPrintWindowForReturn(WindowPrt);
      WindowPrt.document.write(`
        <html>
          <head>
            <title>Print Prescription</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              * { box-sizing: border-box; }
              html, body { margin: 0; padding: 0; background: white; }
              img { max-width: 100%; height: auto; }
              #billing-container {
                width: 100% !important;
                max-width: none !important;
                min-height: auto !important;
                padding: 0 !important;
                border: 0 !important;
                box-shadow: none !important;
              }
              .prescription-logo {
                width: 88px !important;
                height: 88px !important;
                object-fit: contain !important;
              }
              .prescription-header { margin-bottom: 0 !important; }
              .prescription-patient {
                margin-top: 14px !important;
                font-size: 13px !important;
                line-height: 1.35 !important;
              }
              .prescription-content {
                margin-top: 14px !important;
                row-gap: 10px !important;
              }
              .medicine-table {
                font-size: 12px !important;
                line-height: 1.3 !important;
                border-collapse: collapse !important;
              }
              .medicine-table th,
              .medicine-table td {
                padding: 5px 8px !important;
              }
              .prescription-advice {
                margin-top: 12px !important;
                padding-top: 6px !important;
              }
              .prescription-advice p {
                font-size: 12px !important;
                line-height: 1.5 !important;
              }
              @media print {
                body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                @page { size: A4; margin: 0; }
              }
              /* Ensure A4 dimensions for preview in popup */
              .print-container {
                width: 210mm;
                min-height: 297mm;
                padding: 14mm 16mm;
                margin: 0 auto;
                background: white;
              }
            </style>
          </head>
          <body class="bg-gray-100 flex justify-center items-start pt-8 pb-8 print:bg-white print:pt-0 print:pb-0">
            <div class="print-container">
               ${printContent.innerHTML}
            </div>
            <script>
               // Remove print buttons from the cloned content
               const btns = document.querySelectorAll('button');
               btns.forEach(btn => btn.remove());

               let didNotifyPrintDone = false;
               const notifyPrintDone = () => {
                 if (didNotifyPrintDone) {
                   return;
                 }

                 didNotifyPrintDone = true;
                 try {
                   window.opener && window.opener.postMessage({ type: 'prescription-print-complete' }, '*');
                 } catch (error) {}

                 setTimeout(() => window.close(), 100);
               };

               window.addEventListener('afterprint', notifyPrintDone);
               
               // Wait for images to resolve so Windows print preview does not use natural image sizes.
               Promise.all(Array.from(document.images).map((img) => {
                 if (img.complete) {
                   return Promise.resolve();
                 }
                 return new Promise((resolve) => {
                   img.onload = resolve;
                   img.onerror = resolve;
                 });
               })).then(() => {
                 setTimeout(() => {
                   window.print();
                   setTimeout(notifyPrintDone, 1500);
                 }, 300);
               });
            </script>
          </body>
        </html>
      `);
      WindowPrt.document.close();
      WindowPrt.focus();
    }
  }

  private watchPrintWindowForReturn(printWindow: Window): void {
    if (!['reception', 'doctor'].includes(this.printReturnTo)) {
      return;
    }

    this.clearPrintReturnWatch();
    let hasReturned = false;

    const returnToSourcePage = () => {
      if (hasReturned) {
        return;
      }

      hasReturned = true;
      this.clearPrintReturnWatch();
      if (this.printReturnTo === 'doctor') {
        this.router.navigate(['/doctor/dashboard'], {
          queryParams: {
            ...(this.printReturnPatientId ? { patientId: this.printReturnPatientId } : {}),
            ...(this.printReturnDate ? { date: this.printReturnDate } : {})
          }
        });
        return;
      }

      this.router.navigate(['/reception'], {
        queryParams: this.printReturnDate ? { date: this.printReturnDate } : {}
      });
    };

    this.printMessageHandler = (event: MessageEvent) => {
      if (event.source === printWindow && event.data?.type === 'prescription-print-complete') {
        returnToSourcePage();
      }
    };

    window.addEventListener('message', this.printMessageHandler);
    this.printReturnTimer = window.setInterval(() => {
      if (printWindow.closed) {
        returnToSourcePage();
      }
    }, 500);
  }

  private clearPrintReturnWatch(): void {
    if (this.printMessageHandler) {
      window.removeEventListener('message', this.printMessageHandler);
      this.printMessageHandler = undefined;
    }

    if (this.printReturnTimer) {
      window.clearInterval(this.printReturnTimer);
      this.printReturnTimer = undefined;
    }
  }

  // Helper to check if patient has prescriptions
  hasPrescription(p: any): boolean {
    return this.hasActivePrescriptionMedicines;
  }

  getMedicineDaysLabel(medicine: any): string {
    const days = this.getMedicineDays(medicine);
    return days > 0 ? `${days} Days` : (medicine?.duration || '-');
  }

  private getMedicineDays(medicine: any): number {
    const explicitDays = Number(medicine?.daysToTake);
    if (Number.isFinite(explicitDays) && explicitDays > 0) {
      return explicitDays;
    }

    const duration = typeof medicine?.duration === 'string' ? medicine.duration : '';
    const durationDays = Number(duration.match(/\d+/)?.[0]);
    return Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 0;
  }

  get doctorDisplayName(): string {
    return this.doctorProfile?.fullName || 'Doctor Name';
  }

  get doctorTitle(): string {
    return this.doctorProfile?.doctorTitle || '';
  }

  get doctorRegistrationNumber(): string {
    return this.doctorProfile?.doctorRegistrationNumber || '';
  }

  get doctorClinicAddress(): string {
    return this.doctorProfile?.doctorClinicAddress || '';
  }

  get doctorClinicPhone(): string {
    return this.doctorProfile?.doctorClinicPhone || '';
  }

  get doctorEmail(): string {
    return this.doctorProfile?.doctorEmail || '';
  }

  get doctorTimings(): string {
    return this.doctorProfile?.doctorTimings || '';
  }

  get billingDateValue(): Date | string {
    return this.selectedPatient?.latestVisitDate
      ? this.toLocalDate(this.selectedPatient.latestVisitDate)
      : this.selectedDate;
  }

  get billingDateLabel(): string {
    return this.datePipe.transform(this.billingDateValue, 'dd/MM/yyyy') || '';
  }

  get billingId(): string {
    const datePart = this.datePipe.transform(this.billingDateValue, 'yyyyMMdd') || this.datePipe.transform(this.today, 'yyyyMMdd') || '00000000';
    const patientPart = String(this.selectedPatient?.id ?? '0').padStart(4, '0');
    return `BILL-${datePart}-${patientPart}`;
  }
}

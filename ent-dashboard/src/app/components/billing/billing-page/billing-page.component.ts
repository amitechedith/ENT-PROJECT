import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
export class BillingPageComponent implements OnInit {
  allPatients: any[] = [];
  displayedPatients: any[] = [];
  selectedPatient: any; // The patient to print
  selectedDate: Date = new Date();
  today: Date = new Date();
  doctorProfile: User | null = null;
  private pendingPatientId: number | null = null;

  constructor(
    private doctorData: DoctorDataService,
    private authService: AuthService,
    private datePipe: DatePipe,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    const patientIdParam = this.route.snapshot.queryParamMap.get('patientId');
    const patientId = Number(patientIdParam);
    this.pendingPatientId = Number.isFinite(patientId) && patientId > 0 ? patientId : null;

    this.loadDoctorProfile();
    this.loadPatients();
  }

  loadDoctorProfile() {
    this.authService.getUsers().subscribe({
      next: (users) => {
        const doctors = users.filter(user => user.role === 'doctor');
        this.doctorProfile =
          doctors.find(user =>
            !!user.doctorTitle &&
            !!user.doctorRegistrationNumber &&
            !!user.doctorClinicAddress &&
            !!user.doctorClinicPhone &&
            !!user.doctorTimings
          ) || doctors[0] || null;
      },
      error: (err) => console.error('Failed to load doctor profile', err)
    });
  }

  loadPatients() {
    this.doctorData.getTodaysPatients().subscribe({
      next: (data) => {
        this.allPatients = data;
        this.applyDateAndSelection();
      },
      error: (err) => console.error('Failed to load patients', err)
    });
  }

  applyDateAndSelection() {
    if (this.pendingPatientId) {
      const targetPatient = this.allPatients.find(patient => patient.id === this.pendingPatientId);
      if (targetPatient) {
        if (targetPatient.latestVisitDate) {
          this.selectedDate = new Date(targetPatient.latestVisitDate);
        }

        this.filterPatientsByDate();
        this.selectedPatient = this.displayedPatients.find(patient => patient.id === targetPatient.id) || targetPatient;
        this.pendingPatientId = null;
        return;
      }
    }

    this.filterPatientsByDate();
  }

  filterPatientsByDate() {
    if (!this.selectedDate) {
      this.displayedPatients = [...this.allPatients];
      return;
    }

    const selectedDateStr = this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd');

    this.displayedPatients = this.allPatients.filter(patient => {
      if (!patient.latestVisitDate) return false;

      const visitDate = new Date(patient.latestVisitDate);
      const visitDateStr = this.datePipe.transform(visitDate, 'yyyy-MM-dd');
      return visitDateStr === selectedDateStr;
    });

    if (!this.selectedPatient || !this.displayedPatients.some(p => p.id === this.selectedPatient.id)) {
      this.selectedPatient = undefined;
      const paymentDonePatient = this.displayedPatients.find(p => p.status === 'Payment Done');
      if (paymentDonePatient) {
        this.selectedPatient = paymentDonePatient;
      }
    }
  }

  onDateChange() {
    this.selectedPatient = undefined;
    this.filterPatientsByDate();
  }

  selectPatient(patient: any) {
    this.selectedPatient = patient;
  }

  printRx() {
    const printContent = document.getElementById('billing-container');
    const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=900,toolbar=0,scrollbars=0,status=0');

    if (WindowPrt && printContent) {
      WindowPrt.document.write(`
        <html>
          <head>
            <title>Print Prescription</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print {
                body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
                @page { size: A4; margin: 0; }
              }
              /* Ensure A4 dimensions for preview in popup */
              .print-container {
                width: 210mm;
                min-height: 297mm;
                padding: 20mm;
                margin: auto;
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
               
               // Wait for styles/images to load then print
               setTimeout(() => {
                 window.print();
                 window.close();
               }, 500);
            </script>
          </body>
        </html>
      `);
      WindowPrt.document.close();
      WindowPrt.focus();
    }
  }

  // Helper to check if patient has prescriptions
  hasPrescription(p: any): boolean {
    return p.prescriptions && p.prescriptions.length > 0;
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
    return this.doctorProfile?.doctorClinicPhone || this.doctorProfile?.mobile || '';
  }

  get doctorEmergencyPhone(): string {
    return this.doctorProfile?.mobile || this.doctorProfile?.doctorClinicPhone || '';
  }

  get doctorTimings(): string {
    return this.doctorProfile?.doctorTimings || '';
  }

  get billingDateValue(): Date | string {
    return this.selectedPatient?.latestVisitDate || this.selectedDate;
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

import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // Added DatePipe
import { DoctorDataService } from '../../../services/doctor-data.service';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-billing-page',
  standalone: true,
  imports: [CommonModule],
  providers: [DatePipe], // if needed in template
  templateUrl: './billing-page.component.html'
})
export class BillingPageComponent implements OnInit {
  allPatients: any[] = [];
  displayedPatients: any[] = [];
  selectedPatient: any; // The patient to print
  today: Date = new Date();
  doctorProfile: User | null = null;

  constructor(
    private doctorData: DoctorDataService,
    private authService: AuthService
  ) { }

  ngOnInit() {
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
        this.displayedPatients = data;

        // Auto-select first "Payment Done" patient
        const paymentDonePatient = this.displayedPatients.find(p => p.status === 'Payment Done');
        if (paymentDonePatient) {
          this.selectedPatient = paymentDonePatient;
        }
      },
      error: (err) => console.error('Failed to load patients', err)
    });
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

  get doctorTimings(): string {
    return this.doctorProfile?.doctorTimings || '';
  }
}

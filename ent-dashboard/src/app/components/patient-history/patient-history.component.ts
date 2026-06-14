import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PatientHistory, PatientHistoryMedicine, PatientHistoryVisit } from '../../models/patient-history.model';
import { PatientService } from '../../services/patient.service';

@Component({
  selector: 'app-patient-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './patient-history.component.html'
})
export class PatientHistoryComponent implements OnInit {
  patients: PatientHistory[] = [];
  selectedPatient?: PatientHistory;
  searchText = '';
  fromDate = '';
  toDate = '';
  isLoading = false;
  errorMessage = '';

  constructor(
    private patientService: PatientService,
    private datePipe: DatePipe
  ) { }

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.patientService.searchPatientHistory({
      search: this.searchText,
      from: this.fromDate,
      to: this.toDate
    }).subscribe({
      next: (patients) => {
        this.patients = patients || [];
        this.selectedPatient = this.keepOrSelectPatient(this.selectedPatient?.id);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load patient history', err);
        this.errorMessage = 'Unable to load patient history right now.';
        this.patients = [];
        this.selectedPatient = undefined;
        this.isLoading = false;
      }
    });
  }

  searchHistory(event?: Event): void {
    event?.preventDefault();
    this.loadHistory();
  }

  clearFilters(): void {
    this.searchText = '';
    this.fromDate = '';
    this.toDate = '';
    this.loadHistory();
  }

  selectPatient(patient: PatientHistory): void {
    this.selectedPatient = patient;
  }

  get totalVisits(): number {
    return this.patients.reduce((count, patient) => count + patient.visits.length, 0);
  }

  get hasFilters(): boolean {
    return !!this.searchText.trim() || !!this.fromDate || !!this.toDate;
  }

  getLatestVisit(patient: PatientHistory): PatientHistoryVisit | undefined {
    return patient.visits[0];
  }

  formatDate(date?: string | null): string {
    if (!date) {
      return '-';
    }

    return this.datePipe.transform(`${date}T00:00:00`, 'dd MMM yyyy') || date;
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || 'P';
  }

  getStatusClass(status?: string | null): string {
    if (status === 'Payment Done') {
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }

    if (status === 'In Consultation') {
      return 'bg-blue-100 text-blue-700 border-blue-200';
    }

    return 'bg-amber-100 text-amber-700 border-amber-200';
  }

  getPaymentClass(paymentMode?: string | null): string {
    return paymentMode === 'Cash'
      ? 'bg-orange-100 text-orange-700'
      : 'bg-sky-100 text-sky-700';
  }

  getMedicineDuration(medicine: PatientHistoryMedicine): string {
    return medicine.duration || '';
  }

  trackByPatientId(index: number, patient: PatientHistory): number {
    return patient.id;
  }

  trackByVisitDate(index: number, visit: PatientHistoryVisit): string {
    return `${visit.date}-${visit.prescriptionId || index}`;
  }

  trackByMedicine(index: number, medicine: PatientHistoryMedicine): string {
    return `${medicine.id || index}-${medicine.medicineName || ''}`;
  }

  private keepOrSelectPatient(patientId?: number): PatientHistory | undefined {
    if (patientId) {
      const existingPatient = this.patients.find(patient => patient.id === patientId);
      if (existingPatient) {
        return existingPatient;
      }
    }

    return this.patients[0];
  }
}

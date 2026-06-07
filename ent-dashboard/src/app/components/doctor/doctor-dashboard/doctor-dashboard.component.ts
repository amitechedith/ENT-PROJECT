import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CalendarModule } from 'primeng/calendar';
import { MultiSelectModule } from 'primeng/multiselect';
import { AutoComplete, AutoCompleteModule } from 'primeng/autocomplete'; // Added
import { Patient } from '../../../models/patient.model';
import { Prescription } from '../../../models/prescription.model';
import { Medicine } from '../../../models/medicine.model';
import { DoctorDataService } from '../../../services/doctor-data.service';
import { PrescriptionMedicine } from '../../../models/prescription-medicine.model';

@Component({
  selector: 'app-doctor-dashboard',
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
    MultiSelectModule,
    CalendarModule,
    AutoCompleteModule // Added
  ],
  providers: [DatePipe, ConfirmationService],
  templateUrl: './doctor-dashboard.component.html',
  styleUrls: ['./doctor-dashboard.component.css'],
})
export class DoctorDashboardComponent implements OnInit {
  @ViewChild('diagAuto') diagAuto!: AutoComplete;
  @ViewChild('medAuto') medAuto!: AutoComplete;
  @ViewChild('dosageAuto') dosageAuto!: AutoComplete;

  allPatients: Patient[] = [];
  displayedPatients: Patient[] = [];
  selectedPatient?: Patient;

  medicines: any[] = [];
  filteredMedicines: any[] = []; // For AutoComplete
  diagnosisList: any[] = [];
  filteredDiagnoses: any[] = []; // For AutoComplete
  dosages: any[] = [];
  filteredDosages: any[] = []; // For AutoComplete

  selectedDate: Date = new Date();

  currentDiagnosisQuery = '';

  constructor(
    private doctorData: DoctorDataService,
    private datePipe: DatePipe,
    private confirmationService: ConfirmationService
  ) { }

  ngOnInit(): void {
    this.loadData();
  }
  openDiagnosisDropdown() {
    // Load first 10 items
    this.filteredDiagnoses = this.diagnosisList.slice(0, 10);

    if (this.diagAuto) {
      this.diagAuto.show();
    }
  }

  openMedicineDropdown() {
    // Load first 10 items
    this.filteredMedicines = this.medicines.slice(0, 10);

    if (this.medAuto) {
      this.medAuto.show();
    }
  }

  openDosageDropdown() {
    // Load first 10 items
    this.filteredDosages = this.dosages.slice(0, 10);

    if (this.dosageAuto) {
      this.dosageAuto.show();
    }
  }

  loadData() {
    this.doctorData.getAllMedicines().subscribe(meds => {
      this.medicines = meds.map(m => m.name); // Just strings
      this.filteredMedicines = [...this.medicines];
    });

    this.doctorData.getDiagnosisList().subscribe(diags => {
      this.diagnosisList = diags.map(d => d.value); // Just strings
      this.filteredDiagnoses = [...this.diagnosisList];
    });

    this.doctorData.getDosagesList().subscribe(dosages => {
      this.dosages = dosages.map(d => d.name); // Just strings
      this.filteredDosages = [...this.dosages];
    });

    this.doctorData.getTodaysPatients().subscribe({
      next: (data) => {
        this.allPatients = data;
        this.filterPatientsByDate();
      },
      error: (err) => console.error('Failed to load patients', err),
    });
  }

  filterPatientsByDate() {
    if (!this.selectedDate) {
      this.displayedPatients = this.allPatients;
      return;
    }
    const dateStr = this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd');

    this.displayedPatients = this.allPatients.filter(p => {
      if (!p.latestVisitDate) return false;
      // Handle if backend returns Date object or string
      const vDate = new Date(p.latestVisitDate);
      const visitDateStr = this.datePipe.transform(vDate, 'yyyy-MM-dd');
      return visitDateStr === dateStr;
    });

    // Auto-select priority: "In Consultation" -> First "Waiting"
    // Only auto-select if no patient is currently manually selected, or if we are reloading/init load
    if (!this.selectedPatient || this.selectedPatient.latestVisitDate !== dateStr) {
      this.selectedPatient = undefined; // Reset if switching dates

      const inConsultation = this.displayedPatients.find(p => p.status === 'In Consultation');
      if (inConsultation) {
        this.selectPatient(inConsultation);
      } else {
        const firstWaiting = this.displayedPatients.find(p => p.status === 'Waiting');
        if (firstWaiting) {
          this.selectPatient(firstWaiting);
        }
      }
    }
  }

  onDateChange() {
    this.selectedPatient = undefined; // Clear selection on date change to trigger auto-select logic
    this.filterPatientsByDate();
  }

  selectPatient(patient: Patient): void {
    this.selectedPatient = patient;
    this.ensurePrescriptionExists();
    // Default currentDiagnosis to empty array if undefined
    if (!this.selectedPatient.currentDiagnosis) {
      this.selectedPatient.currentDiagnosis = [];
    }
  }

  backToList(): void {
    this.selectedPatient = undefined;
  }

  ensurePrescriptionExists() {
    if (!this.selectedPatient) return;

    if (!this.selectedPatient.prescriptions) {
      this.selectedPatient.prescriptions = [];
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const existing = this.selectedPatient.prescriptions.find(p => p.date.startsWith(todayStr));

    if (!existing) {
      this.selectedPatient.prescriptions.push({
        id: Date.now(),
        patientId: this.selectedPatient.id!,
        date: new Date().toISOString(),
        notes: '',
        consultationFee: 500,
        medicines: []
      });
    }
  }

  getCurrentPrescription(): Prescription | undefined {
    if (!this.selectedPatient?.prescriptions) return undefined;
    return this.selectedPatient.prescriptions[this.selectedPatient.prescriptions.length - 1];
  }

  addMedicine(): void {
    const pres = this.getCurrentPrescription();
    if (!pres) return;

    pres.medicines.push({
      prescriptionId: pres.id || 0,
      medicineId: 0,
      medicineName: '',
      dosage: '1-0-1',
      daysToTake: 5,
    });
  }

  removeMedicine(index: number): void {
    const pres = this.getCurrentPrescription();
    if (pres && pres.medicines.length > index) {
      pres.medicines.splice(index, 1);
    }
  }

  // --- AutoComplete Logic for Diagnosis ---

  searchDiagnosis(event: any) {
    const query = event.query;
    this.currentDiagnosisQuery = query || '';

    if (!query) {
      // Show all if empty (e.g. dropdown click)
      this.filteredDiagnoses = [...this.diagnosisList];
    } else {
      // Filter existing
      this.filteredDiagnoses = this.diagnosisList.filter(d => d.toLowerCase().includes(query.toLowerCase()));
    }
  }

  // --- Medicine Helper ---

  // --- Medicine Helper ---

  searchMedicine(event: any) {
    const query = event.query;

    if (!query) {
      this.filteredMedicines = [...this.medicines];
    } else {
      this.filteredMedicines = this.medicines.filter(m => m.toLowerCase().includes(query.toLowerCase()));
    }
  }

  searchDosage(event: any) {
    const query = event.query;

    if (!query) {
      this.filteredDosages = [...this.dosages];
    } else {
      const filtered = this.dosages.filter(d => d.toLowerCase().includes(query.toLowerCase()));

      const exactMatch = filtered.some(d => d.toLowerCase() === query.toLowerCase());
      if (!exactMatch) {
        filtered.unshift(query);
      }
      this.filteredDosages = filtered;
    }
  }

  confirmDeleteDiagnosis(name: string, event?: Event): void {
    this.confirmDeletion('diagnosis', name, () => this.deleteDiagnosis(name), event);
  }

  confirmDeleteMedicine(name: string, event?: Event): void {
    this.confirmDeletion('medicine', name, () => this.deleteMedicine(name), event);
  }

  confirmDeleteDosage(name: string, event?: Event): void {
    this.confirmDeletion('dosage', name, () => this.deleteDosage(name), event);
  }

  onDiagnosisSelect(event: any) {
    // PrimeNG AutoComplete onSelect emits an event object with { originalEvent, value }
    console.log('onDiagnosisSelect received:', event);
    const selectedItem = event.value || event;
    console.log('Extracted selectedItem:', selectedItem, 'Type:', typeof selectedItem);

    const diagnosisName = this.normalizeMasterValue(selectedItem);

    if (!diagnosisName || this.isValueInList(diagnosisName, this.diagnosisList)) {
      console.log('Skipping addDiagnosis - already exists or invalid type');
      return;
    }

    this.addDiagnosisToMaster(diagnosisName);
  }

  onMedicineSelect(event: any) {
    // PrimeNG AutoComplete onSelect emits an event object with { originalEvent, value }
    const selectedItem = event.value || event;

    const medicineName = this.normalizeMasterValue(selectedItem);

    if (medicineName && !this.isValueInList(medicineName, this.medicines)) {
      this.addMedicineToMaster(medicineName);
    }
  }

  onDosageSelect(event: any) {
    // PrimeNG AutoComplete onSelect emits an event object with { originalEvent, value }
    const selectedItem = event.value || event;
    if (selectedItem && typeof selectedItem === 'string' && !this.dosages.includes(selectedItem)) {
      this.doctorData.addDosage(selectedItem).subscribe({
        next: (res) => {
          console.log('Immediately added dosage:', selectedItem);
          this.dosages.push(selectedItem);
        },
        error: (err) => console.error('Error adding dosage', err)
      });
    }
  }

  private normalizeMasterValue(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isValueInList(value: string, list: string[]): boolean {
    const normalizedValue = this.normalizeMasterValue(value).toLowerCase();
    return normalizedValue.length > 0 && list.some(item => this.normalizeMasterValue(item).toLowerCase() === normalizedValue);
  }

  isNewDiagnosis(value?: string): boolean {
    const diagnosisName = this.normalizeMasterValue(value);
    return !!diagnosisName && !this.isValueInList(diagnosisName, this.diagnosisList);
  }

  isNewMedicine(value?: string): boolean {
    const medicineName = this.normalizeMasterValue(value);
    return !!medicineName && !this.isValueInList(medicineName, this.medicines);
  }

  addDiagnosisToMaster(value?: string): void {
    const diagnosisName = this.normalizeMasterValue(value ?? this.currentDiagnosisQuery);
    if (!diagnosisName || !this.selectedPatient) {
      return;
    }

    if (!this.selectedPatient.currentDiagnosis) {
      this.selectedPatient.currentDiagnosis = [];
    }

    if (!this.selectedPatient.currentDiagnosis.some(item => this.normalizeMasterValue(item).toLowerCase() === diagnosisName.toLowerCase())) {
      this.selectedPatient.currentDiagnosis.push(diagnosisName);
    }

    if (this.isValueInList(diagnosisName, this.diagnosisList)) {
      this.clearDiagnosisQuery();
      return;
    }

    this.doctorData.addDiagnosis(diagnosisName).subscribe({
      next: () => {
        console.log('Added new diagnosis to master:', diagnosisName);
        this.diagnosisList.push(diagnosisName);
        this.filteredDiagnoses = [...this.diagnosisList];
        this.clearDiagnosisQuery();
      },
      error: (err) => console.error('Error adding diagnosis', err)
    });
  }

  private confirmDeletion(
    type: 'diagnosis' | 'medicine' | 'dosage',
    name: string,
    accept: () => void,
    event?: Event
  ): void {
    event?.preventDefault();
    event?.stopPropagation();

    const normalizedName = this.normalizeMasterValue(name);
    if (!normalizedName) {
      return;
    }

    this.confirmationService.confirm({
      message: `Delete "${normalizedName}" from the ${type} list?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept
    });
  }

  private deleteDiagnosis(name: string): void {
    const normalizedName = this.normalizeMasterValue(name);
    this.doctorData.deleteDiagnosis(normalizedName).subscribe({
      next: () => {
        this.diagnosisList = this.diagnosisList.filter(item => this.normalizeMasterValue(item).toLowerCase() !== normalizedName.toLowerCase());
        this.filteredDiagnoses = this.filteredDiagnoses.filter(item => this.normalizeMasterValue(item).toLowerCase() !== normalizedName.toLowerCase());
      },
      error: (err) => console.error('Error deleting diagnosis', err)
    });
  }

  private deleteMedicine(name: string): void {
    const normalizedName = this.normalizeMasterValue(name);
    this.doctorData.deleteMedicine(normalizedName).subscribe({
      next: () => {
        this.medicines = this.medicines.filter(item => this.normalizeMasterValue(item).toLowerCase() !== normalizedName.toLowerCase());
        this.filteredMedicines = this.filteredMedicines.filter(item => this.normalizeMasterValue(item).toLowerCase() !== normalizedName.toLowerCase());
      },
      error: (err) => console.error('Error deleting medicine', err)
    });
  }

  private deleteDosage(name: string): void {
    const normalizedName = this.normalizeMasterValue(name);
    this.doctorData.deleteDosage(normalizedName).subscribe({
      next: () => {
        this.dosages = this.dosages.filter(item => this.normalizeMasterValue(item).toLowerCase() !== normalizedName.toLowerCase());
        this.filteredDosages = this.filteredDosages.filter(item => this.normalizeMasterValue(item).toLowerCase() !== normalizedName.toLowerCase());
      },
      error: (err) => console.error('Error deleting dosage', err)
    });
  }

  private clearDiagnosisQuery(): void {
    this.currentDiagnosisQuery = '';
    if (this.diagAuto?.inputEL?.nativeElement) {
      this.diagAuto.inputEL.nativeElement.value = '';
    }
    this.diagAuto?.hide(true);
  }

  addMedicineToMaster(medicine: { medicineName?: string } | string): void {
    const medicineName = this.normalizeMasterValue(
      typeof medicine === 'string' ? medicine : medicine.medicineName
    );
    if (!medicineName || this.isValueInList(medicineName, this.medicines)) {
      return;
    }

    if (typeof medicine !== 'string') {
      medicine.medicineName = medicineName;
    }

    this.doctorData.addMedicine(medicineName).subscribe({
      next: () => {
        console.log('Added new medicine to master:', medicineName);
        this.medicines.push(medicineName);
        this.filteredMedicines = [...this.medicines];
      },
      error: (err) => console.error('Error adding medicine', err)
    });
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  getLastPrescriptionNotes(): string {
    if (!this.selectedPatient) return 'No notes';
    const details = this.getLastVisitDetails(this.selectedPatient);
    return details ? details.notes : 'No previous notes';
  }

  getSelectedPatientIndex(): number {
    return this.displayedPatients.findIndex(p => p.id === this.selectedPatient?.id);
  }

  hasPreviousPatient(): boolean {
    return this.getSelectedPatientIndex() > 0;
  }

  hasNextPatient(): boolean {
    const idx = this.getSelectedPatientIndex();
    return idx !== -1 && idx < this.displayedPatients.length - 1;
  }

  goToPreviousPatient(): void {
    const idx = this.getSelectedPatientIndex();
    if (idx > 0) this.selectPatient(this.displayedPatients[idx - 1]);
  }

  goToNextPatient(): void {
    const idx = this.getSelectedPatientIndex();
    if (idx !== -1 && idx < this.displayedPatients.length - 1) {
      this.selectPatient(this.displayedPatients[idx + 1]);
    }
  }

  getPatientLastVisit(p: Patient): string {
    if (!p.prescriptions || p.prescriptions.length < 2) return 'N/A';
    const todayStr = new Date().toISOString().split('T')[0];
    const prev = p.prescriptions.filter(pre => !pre.date.startsWith(todayStr)).pop();
    return prev ? prev.date.split('T')[0] : 'N/A';
  }

  getLastVisitDetails(p: Patient): { date: string, notes: string } | null {
    if (!p.prescriptions || p.prescriptions.length < 2) return null;
    const todayStr = new Date().toISOString().split('T')[0];
    const prev = p.prescriptions.filter(pre => !pre.date.startsWith(todayStr)).pop();
    if (!prev) return null;
    return {
      date: prev.date.split('T')[0],
      notes: prev.notes || 'No notes'
    };
  }

  saveChanges(): void {
    if (!this.selectedPatient || !this.selectedPatient.prescriptions) return;

    // 1. Identify and Save New Diagnoses
    const currentDiagnoses = this.selectedPatient.currentDiagnosis || [];
    const newDiagnoses = currentDiagnoses
      .map(d => this.normalizeMasterValue(d))
      .filter(d => d && !this.isValueInList(d, this.diagnosisList));

    newDiagnoses.forEach(d => {
      this.doctorData.addDiagnosis(d).subscribe({
        next: (res) => {
          console.log('Added new diagnosis:', d);
          // Refresh local list
          this.diagnosisList.push(d);
        }
      });
    });

    // 2. Identify and Save New Medicines
    const currentPrescription = this.selectedPatient.prescriptions.find(p => {
      const todayStr = new Date().toISOString().split('T')[0];
      return p.date.startsWith(todayStr); // Matches today
    });

    if (currentPrescription) {
      // Check for new medicines
      // medicines array contains objects { medicineName: string... }
      currentPrescription.medicines.forEach(m => {
        const medicineName = this.normalizeMasterValue(m.medicineName);
        if (medicineName && !this.isValueInList(medicineName, this.medicines)) {
          this.doctorData.addMedicine(medicineName).subscribe({
            next: () => {
              console.log('Added new medicine:', medicineName);
              this.medicines.push(medicineName);
            }
          });
        }
      });

      // Prepare payload for backend
      const payload = {
        patientId: this.selectedPatient.id,
        date: currentPrescription.date,
        notes: currentPrescription.notes,
        nextVisitDate: null,
        medicines: currentPrescription.medicines.map(m => ({
          medicineName: m.medicineName,
          dosage: m.dosage,
          duration: m.daysToTake ? `${m.daysToTake} days` : '',
          instructions: ''
        }))
      };

      // 3. Update Patient Diagnosis Link
      if (currentDiagnoses.length > 0) {
        this.savePatientDiagnosis(this.selectedPatient.id!, currentDiagnoses);
      }

      this.doctorData.savePrescription(this.selectedPatient.id!, payload).subscribe({
        next: (res) => {
          alert('Prescription & Data saved successfully!');
          this.backToList();
        },
        error: (err) => {
          console.error(err);
          alert('Error saving prescription');
        }
      });
    } else {
      if (currentDiagnoses.length > 0) {
        this.savePatientDiagnosis(this.selectedPatient.id!, currentDiagnoses);
        alert('Diagnoses saved!');
        this.backToList();
      } else {
        alert('No changes to save');
      }
    }
  }

  savePatientDiagnosis(patientId: number, diagnoses: string[]) {
    this.doctorData.updatePatientDiagnosis(patientId, diagnoses).subscribe();
  }
}

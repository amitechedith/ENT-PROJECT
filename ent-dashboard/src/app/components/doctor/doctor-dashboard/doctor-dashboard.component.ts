import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, Observable } from 'rxjs';

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
    ToastModule,
    AutoCompleteModule // Added
  ],
  providers: [DatePipe, ConfirmationService, MessageService],
  templateUrl: './doctor-dashboard.component.html',
  styleUrls: ['./doctor-dashboard.component.css'],
})
export class DoctorDashboardComponent implements OnInit {
  @ViewChild('diagAuto') diagAuto!: AutoComplete;
  @ViewChild('medAuto') medAuto!: AutoComplete;
  @ViewChild('dosageAuto') dosageAuto!: AutoComplete;
  @ViewChild('newMedAuto') newMedAuto!: AutoComplete;

  displayedPatients: Patient[] = [];
  selectedPatient?: Patient;
  private loadedPrescriptionPatientIds = new Set<number>();
  private pendingPatientId: number | null = null;

  medicines: any[] = [];
  filteredMedicines: any[] = []; // For AutoComplete
  diagnosisList: any[] = [];
  filteredDiagnoses: any[] = []; // For AutoComplete
  dosages: any[] = [];
  filteredDosages: any[] = []; // For AutoComplete

  selectedDate: Date = new Date();

  currentDiagnosisQuery = '';
  newMedicineDraft: Partial<PrescriptionMedicine> = this.createNewMedicineDraft();

  constructor(
    private doctorData: DoctorDataService,
    private datePipe: DatePipe,
    private confirmationService: ConfirmationService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService
  ) { }

  ngOnInit(): void {
    const patientIdParam = this.route.snapshot.queryParamMap.get('patientId');
    const patientId = Number(patientIdParam);
    this.pendingPatientId = Number.isFinite(patientId) && patientId > 0 ? patientId : null;

    this.loadData();
  }
  openDiagnosisDropdown() {
    // Load first 10 items
    this.filteredDiagnoses = this.diagnosisList.slice(0, 10);

    if (this.diagAuto) {
      this.diagAuto.show();
    }
  }

  openMedicineDropdown(auto?: AutoComplete) {
    // Load first 10 items
    this.filteredMedicines = this.medicines.slice(0, 10);

    const targetAuto = auto || this.medAuto;
    if (targetAuto) {
      targetAuto.show();
    }
  }

  openDosageDropdown(auto?: AutoComplete) {
    // Load first 10 items
    this.filteredDosages = this.dosages.slice(0, 10);

    const targetAuto = auto || this.dosageAuto;
    if (targetAuto) {
      targetAuto.show();
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

    this.bootstrapPatients();
  }

  private bootstrapPatients(): void {
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

  formatVisitDate(dateValue?: string | Date | null): string {
    if (!dateValue) {
      return '';
    }

    return this.datePipe.transform(this.toLocalDate(dateValue), 'dd/MM/yyyy') || '';
  }

  loadPatientsForSelectedDate(preselectPatientId: number | null = null): void {
    const dateKey = this.getSelectedDateKey();
    if (!dateKey) {
      this.displayedPatients = [];
      this.selectedPatient = undefined;
      return;
    }

    this.loadedPrescriptionPatientIds.clear();
    this.doctorData.getPatientsByDate(dateKey).subscribe({
      next: (data) => {
        this.displayedPatients = data;

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
      error: (err) => console.error('Failed to load patients', err),
    });
  }

  private applyAutoSelection(): void {
    if (this.displayedPatients.length === 0) {
      this.selectedPatient = undefined;
      return;
    }

    const selectedId = this.selectedPatient?.id;
    if (selectedId) {
      const stillVisible = this.displayedPatients.find(patient => patient.id === selectedId);
      if (stillVisible) {
        this.selectPatient(stillVisible);
        return;
      }
    }

    const inConsultation = this.displayedPatients.find(patient => patient.status === 'In Consultation');
    if (inConsultation) {
      this.selectPatient(inConsultation);
      return;
    }

    const firstWaiting = this.displayedPatients.find(patient => patient.status === 'Waiting');
    if (firstWaiting) {
      this.selectPatient(firstWaiting);
      return;
    }

    this.selectPatient(this.displayedPatients[0]);
  }

  onDateChange() {
    this.selectedPatient = undefined;
    this.loadPatientsForSelectedDate();
  }

  selectPatient(patient: Patient): void {
    this.selectedPatient = patient;
    this.updatePatientQueryParam(patient.id);
    this.resetNewMedicineDraft();
    // Default currentDiagnosis to empty array if undefined
    if (!this.selectedPatient.currentDiagnosis) {
      this.selectedPatient.currentDiagnosis = [];
    }

    if (patient.id && this.loadedPrescriptionPatientIds.has(patient.id)) {
      this.ensurePrescriptionExists();
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

  private loadPatientPrescriptions(patient: Patient): void {
    if (!patient.id) {
      this.ensurePrescriptionExists();
      return;
    }

    this.doctorData.getPatientPrescriptions(patient.id).subscribe({
      next: (prescriptions) => {
        patient.prescriptions = (prescriptions || []).map(prescription => this.normalizePrescription(prescription));
        this.loadedPrescriptionPatientIds.add(patient.id!);
        this.ensurePrescriptionExists();
      },
      error: (err) => {
        console.error('Failed to load prescriptions for patient', err);
        patient.prescriptions = patient.prescriptions || [];
        this.loadedPrescriptionPatientIds.add(patient.id!);
        this.ensurePrescriptionExists();
      }
    });
  }

  private normalizePrescription(prescription: Prescription): Prescription {
    return {
      ...prescription,
      medicines: (prescription.medicines || []).map(medicine => ({
        ...medicine,
        daysToTake: this.getMedicineDays(medicine)
      }))
    };
  }

  private getMedicineDays(medicine: Partial<PrescriptionMedicine>): number {
    const explicitDays = Number(medicine.daysToTake);
    if (Number.isFinite(explicitDays) && explicitDays > 0) {
      return explicitDays;
    }

    const duration = typeof medicine.duration === 'string' ? medicine.duration : '';
    const durationDays = Number(duration.match(/\d+/)?.[0]);
    return Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 5;
  }

  backToList(): void {
    this.selectedPatient = undefined;
  }

  goToBilling(patient?: Patient): void {
    const targetPatient = patient || this.selectedPatient;
    if (!targetPatient?.id) {
      return;
    }

    this.router.navigate(['/billing'], {
      queryParams: { patientId: targetPatient.id }
    });
  }

  ensurePrescriptionExists() {
    if (!this.selectedPatient) return;

    console.log('Ensuring prescription exists for patient:', this.selectedPatient);

    if (!this.selectedPatient.prescriptions) {
      this.selectedPatient.prescriptions = [];
    }

    const selectedDateStr = this.getSelectedDateKey();
    const existing = this.selectedPatient.prescriptions.find(p => String(p.date).startsWith(selectedDateStr));

    if (!existing) {
      this.selectedPatient.prescriptions.push({
        id: Date.now(),
        patientId: this.selectedPatient.id!,
        date: selectedDateStr,
        notes: '',
        consultationFee: Number(this.selectedPatient.consultationFee || 0) || 500,
        medicines: []
      });
    }
  }

  getCurrentPrescription(): Prescription | undefined {
    if (!this.selectedPatient?.prescriptions) return undefined;

    const selectedDateStr = this.getSelectedDateKey();
    const selectedPrescription = this.selectedPatient.prescriptions.find(p => String(p.date).startsWith(selectedDateStr));
    return selectedPrescription || this.selectedPatient.prescriptions[this.selectedPatient.prescriptions.length - 1];
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

  private createNewMedicineDraft(): Partial<PrescriptionMedicine> {
    return {
      medicineName: '',
      dosage: '1-0-1',
      daysToTake: 5
    };
  }

  resetNewMedicineDraft(): void {
    this.newMedicineDraft = this.createNewMedicineDraft();
    if (this.newMedAuto?.inputEL?.nativeElement) {
      this.newMedAuto.inputEL.nativeElement.value = '';
    }
    this.newMedAuto?.hide(true);
  }

  addDraftMedicineToPrescription(): void {
    const pres = this.getCurrentPrescription();
    if (!pres) return;

    const medicineName = this.normalizeMasterValue(this.newMedicineDraft.medicineName);
    if (!medicineName) return;

    const daysToTake = Number(this.newMedicineDraft.daysToTake || 0);
    const dosage = this.normalizeMasterValue(this.newMedicineDraft.dosage) || '1-0-1';

    const alreadyAdded = pres.medicines.some(m => this.normalizeMasterValue(m.medicineName).toLowerCase() === medicineName.toLowerCase());
    if (!alreadyAdded) {
      pres.medicines.push({
        prescriptionId: pres.id || 0,
        medicineId: 0,
        medicineName,
        dosage,
        daysToTake: daysToTake > 0 ? daysToTake : 5,
      });
    }

    this.resetNewMedicineDraft();

    if (!this.isValueInList(medicineName, this.medicines)) {
      this.doctorData.addMedicine(medicineName).subscribe({
        next: () => {
          this.medicines.push(medicineName);
          this.filteredMedicines = [...this.medicines];
        },
        error: (err) => console.error('Error adding medicine', err)
      });
    }
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

  onDraftMedicineSelect(event: any): void {
    const selectedItem = event.value || event;
    const medicineName = this.normalizeMasterValue(selectedItem);

    if (!medicineName) {
      return;
    }

    this.newMedicineDraft.medicineName = medicineName;
    this.addDraftMedicineToPrescription();
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
    const selectedDateStr = this.getSelectedDateKey();
    const prev = p.prescriptions.filter(pre => !String(pre.date).startsWith(selectedDateStr)).pop();
    return prev ? String(prev.date).split('T')[0] : 'N/A';
  }

  getLastVisitDetails(p: Patient): { date: string, notes: string } | null {
    if (!p.prescriptions || p.prescriptions.length < 2) return null;
    const selectedDateStr = this.getSelectedDateKey();
    const prev = p.prescriptions.filter(pre => !String(pre.date).startsWith(selectedDateStr)).pop();
    if (!prev) return null;
    return {
      date: String(prev.date).split('T')[0],
      notes: prev.notes || 'No notes'
    };
  }

  saveChanges(): void {
    if (!this.selectedPatient?.id) return;

    this.selectedPatient.status = 'In Consultation';
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

    this.addDraftMedicineToPrescription();
    const currentPrescription = this.getCurrentPrescription();
    console.log('Current prescription for today:', currentPrescription);

    const saveRequests: Observable<any>[] = [
      this.doctorData.updatePatient(this.selectedPatient)
    ];

    if (currentDiagnoses.length > 0) {
      saveRequests.push(this.doctorData.updatePatientDiagnosis(this.selectedPatient.id, currentDiagnoses));
    }

    if (currentPrescription) {
      const payload = {
        patientId: this.selectedPatient.id,
        date: currentPrescription.date,
        notes: currentPrescription.notes,
        nextVisitDate: null,
        medicines: currentPrescription.medicines
          .map(m => ({
            medicineId: m.medicineId,
            medicineName: this.normalizeMasterValue(m.medicineName),
            dosage: this.normalizeMasterValue(m.dosage),
            duration: `${this.getMedicineDays(m)} days`,
            instructions: ''
          }))
          .filter(m => !!m.medicineName)
      };

      saveRequests.push(this.doctorData.savePrescription(this.selectedPatient.id, payload));
    }

    forkJoin(saveRequests).subscribe({
      next: () => {
        this.displayedPatients = this.displayedPatients.map(patient =>
          patient.id === this.selectedPatient?.id
            ? { ...patient, status: 'In Consultation' }
            : patient
        );

        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: currentPrescription ? 'Prescription & Data saved successfully!' : 'Patient data saved successfully!',
          life: 1000
        });
      },
      error: (err) => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Unable to save consultation data',
          life: 3000
        });
      }
    });
  }

}

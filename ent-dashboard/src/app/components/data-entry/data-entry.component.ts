import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoComplete, AutoCompleteModule } from 'primeng/autocomplete';
import { Medicine } from '../../models/medicine.model';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { Diagnosis } from '../../models/diagnosis.model';
import {
  DataService,
  DiagnosisTemplateMedicine,
  DiagnosisTemplateSummary
} from '../../services/data.service';

@Component({
  selector: 'app-data-entry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    InputTextareaModule,
    TableModule,
    ToastModule,
    AutoCompleteModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './data-entry.component.html'
})
export class DataEntryComponent implements OnInit {
  activeSection: 'medicines' | 'diagnosis' | null = null;
  medicines: Medicine[] = [];
  filteredMedicines: Medicine[] = [];
  templateMedicineSuggestions: string[] = [];
  diagnoses: Diagnosis[] = [];
  dosages: Array<{ id?: number; name: string }> = [];
  templateDosageSuggestions: string[] = [];
  doctors: User[] = [];
  diagnosisTemplates: DiagnosisTemplateSummary[] = [];
  templateMedicines: DiagnosisTemplateMedicine[] = [this.createTemplateMedicineRow()];
  medicineText = '';
  searchText = '';
  templateSearchText = '';
  selectedDoctorId = '';
  selectedDiagnosisName = '';
  newDiagnosisName = '';
  diagnosisEntryMode: 'existing' | 'new' = 'existing';
  isLoading = false;
  isSaving = false;
  isImporting = false;
  isExporting = false;
  isTemplateLoading = false;
  isTemplateSaving = false;
  currentUser: User | null = null;

  constructor(
    private authService: AuthService,
    private dataService: DataService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.initializeDoctorSelection();
    this.loadMedicines();
    this.loadDiagnoses();
    this.loadDosages();
  }

  setActiveSection(section: 'medicines' | 'diagnosis'): void {
    this.activeSection = section;
    if (section === 'diagnosis' && this.selectedDoctorId) {
      this.loadDiagnosisTemplates();
    }
  }

  clearActiveSection(): void {
    this.activeSection = null;
  }

  private initializeDoctorSelection(): void {
    if (this.currentUser?.role === 'doctor') {
      this.selectedDoctorId = this.currentUser.id;
      this.doctors = [this.currentUser];
      this.loadDiagnosisTemplates();
      return;
    }

    this.authService.getUsers().subscribe({
      next: users => {
        this.doctors = users.filter(user => user.role === 'doctor');
        this.selectedDoctorId = this.doctors[0]?.id || '';
        if (this.selectedDoctorId) {
          this.loadDiagnosisTemplates();
        }
      },
      error: () => this.showError('Unable to load doctors.')
    });
  }

  loadMedicines(): void {
    this.isLoading = true;
    this.dataService.getMedicines().subscribe({
      next: medicines => {
        this.medicines = medicines;
        this.templateMedicineSuggestions = this.getMedicineNames();
        this.applyFilter();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.showError('Unable to load medicines.');
      }
    });
  }

  loadDiagnoses(): void {
    this.dataService.getDiagnosisList().subscribe({
      next: diagnoses => this.diagnoses = diagnoses,
      error: () => this.showError('Unable to load diagnoses.')
    });
  }

  loadDosages(): void {
    this.dataService.getDosagesList().subscribe({
      next: dosages => {
        this.dosages = dosages;
        this.templateDosageSuggestions = this.getDosageNames();
      },
      error: () => this.showError('Unable to load dosages.')
    });
  }

  onTemplateDoctorChange(): void {
    this.selectedDiagnosisName = '';
    this.newDiagnosisName = '';
    this.diagnosisEntryMode = 'existing';
    this.templateMedicines = [this.createTemplateMedicineRow()];
    this.loadDiagnosisTemplates();
  }

  onDiagnosisEntryModeChange(): void {
    this.selectedDiagnosisName = '';
    this.newDiagnosisName = '';
    this.templateMedicines = [this.createTemplateMedicineRow()];
  }

  loadDiagnosisTemplates(): void {
    if (!this.selectedDoctorId) {
      this.diagnosisTemplates = [];
      return;
    }

    this.isTemplateLoading = true;
    this.dataService.getDiagnosisTemplates(this.selectedDoctorId).subscribe({
      next: templates => {
        this.diagnosisTemplates = templates || [];
        this.isTemplateLoading = false;
      },
      error: () => {
        this.isTemplateLoading = false;
        this.showError('Unable to load diagnosis templates.');
      }
    });
  }

  loadDiagnosisTemplate(diagnosisName: string): void {
    const normalizedName = this.normalizeName(diagnosisName);
    if (!this.selectedDoctorId || !normalizedName) {
      return;
    }

    this.selectedDiagnosisName = normalizedName;
    this.newDiagnosisName = '';
    this.diagnosisEntryMode = 'existing';
    this.isTemplateLoading = true;
    this.dataService.getDiagnosisTemplate(this.selectedDoctorId, normalizedName).subscribe({
      next: template => {
        this.templateMedicines = template.medicines?.length
          ? template.medicines.map(medicine => ({
            medicineName: medicine.medicineName || '',
            dosage: medicine.dosage || '',
            daysToTake: Number(medicine.daysToTake || 5) || 5,
            medicineId: medicine.medicineId || undefined
          }))
          : [this.createTemplateMedicineRow()];
        this.isTemplateLoading = false;
      },
      error: () => {
        this.templateMedicines = [this.createTemplateMedicineRow()];
        this.isTemplateLoading = false;
        this.showError('Unable to load this diagnosis template.');
      }
    });
  }

  addTemplateMedicineRow(): void {
    this.templateMedicines.push(this.createTemplateMedicineRow());
  }

  removeTemplateMedicineRow(index: number): void {
    this.templateMedicines.splice(index, 1);
    if (!this.templateMedicines.length) {
      this.addTemplateMedicineRow();
    }
  }

  saveDiagnosisTemplate(): void {
    if (!this.currentUser?.role) {
      this.showError('User session not found.');
      return;
    }

    const diagnosisName = this.getTemplateDiagnosisName();
    if (!this.selectedDoctorId) {
      this.showWarn('Select a doctor.');
      return;
    }

    if (!diagnosisName) {
      this.showWarn('Select or enter a diagnosis.');
      return;
    }

    const medicines = this.templateMedicines
      .map(medicine => ({
        medicineName: this.normalizeName(medicine.medicineName),
        dosage: this.normalizeName(medicine.dosage),
        daysToTake: Number(medicine.daysToTake || 0) > 0 ? Number(medicine.daysToTake) : 5
      }))
      .filter(medicine => !!medicine.medicineName);

    if (!medicines.length) {
      this.showWarn('Add at least one medicine.');
      return;
    }

    this.isTemplateSaving = true;
    this.dataService.saveDiagnosisTemplate(this.currentUser.role, {
      doctorId: this.selectedDoctorId,
      diagnosisName,
      medicines
    }).subscribe({
      next: () => {
        this.isTemplateSaving = false;
        this.selectedDiagnosisName = diagnosisName;
        this.newDiagnosisName = '';
        this.diagnosisEntryMode = 'existing';
        this.showSuccess(this.isUpdatingDiagnosisTemplate ? 'Diagnosis template updated.' : 'Diagnosis template saved.');
        this.loadMedicines();
        this.loadDiagnoses();
        this.loadDosages();
        this.loadDiagnosisTemplates();
      },
      error: err => {
        this.isTemplateSaving = false;
        this.showError(err.error?.message || 'Unable to save diagnosis template.');
      }
    });
  }

  confirmDeleteDiagnosisTemplate(template: DiagnosisTemplateSummary, event: Event): void {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: `Delete medicines set for "${template.diagnosisName}"?`,
      header: 'Delete Diagnosis Template',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteDiagnosisTemplate(template.diagnosisName)
    });
  }

  private deleteDiagnosisTemplate(diagnosisName: string): void {
    if (!this.currentUser?.role || !this.selectedDoctorId) {
      this.showError('User session not found.');
      return;
    }

    this.dataService.deleteDiagnosisTemplate(this.currentUser.role, this.selectedDoctorId, diagnosisName).subscribe({
      next: () => {
        if (this.normalizeName(this.selectedDiagnosisName).toLowerCase() === this.normalizeName(diagnosisName).toLowerCase()) {
          this.selectedDiagnosisName = '';
          this.templateMedicines = [this.createTemplateMedicineRow()];
        }
        this.showSuccess('Diagnosis template deleted.');
        this.loadDiagnosisTemplates();
      },
      error: err => this.showError(err.error?.message || 'Unable to delete diagnosis template.')
    });
  }

  get filteredDiagnosisTemplates(): DiagnosisTemplateSummary[] {
    const query = this.normalizeName(this.templateSearchText).toLowerCase();
    return query
      ? this.diagnosisTemplates.filter(template => template.diagnosisName.toLowerCase().includes(query))
      : [...this.diagnosisTemplates];
  }

  get activeDoctorName(): string {
    return this.doctors.find(doctor => doctor.id === this.selectedDoctorId)?.fullName || 'Selected doctor';
  }

  getTemplateDiagnosisName(): string {
    return this.normalizeName(this.diagnosisEntryMode === 'new' ? this.newDiagnosisName : this.selectedDiagnosisName);
  }

  get isUpdatingDiagnosisTemplate(): boolean {
    const diagnosisName = this.getTemplateDiagnosisName().toLowerCase();
    return !!diagnosisName && this.diagnosisTemplates.some(template =>
      this.normalizeName(template.diagnosisName).toLowerCase() === diagnosisName
    );
  }

  private createTemplateMedicineRow(): DiagnosisTemplateMedicine {
    return {
      medicineName: '',
      dosage: '1-0-1',
      daysToTake: 5
    };
  }

  openTemplateMedicineDropdown(auto: AutoComplete): void {
    this.templateMedicineSuggestions = this.getMedicineNames().slice(0, 10);
    auto.show();
  }

  openTemplateDosageDropdown(auto: AutoComplete): void {
    this.templateDosageSuggestions = this.getDosageNames().slice(0, 10);
    auto.show();
  }

  searchTemplateMedicine(event: { query?: string }): void {
    const query = this.normalizeName(event.query).toLowerCase();
    const medicineNames = this.getMedicineNames();
    this.templateMedicineSuggestions = query
      ? medicineNames.filter(name => name.toLowerCase().includes(query))
      : medicineNames;
  }

  searchTemplateDosage(event: { query?: string }): void {
    const query = this.normalizeName(event.query).toLowerCase();
    const dosageNames = this.getDosageNames();
    const filtered = query
      ? dosageNames.filter(name => name.toLowerCase().includes(query))
      : dosageNames;

    const rawQuery = this.normalizeName(event.query);
    if (rawQuery && !this.isNameInList(rawQuery, filtered)) {
      filtered.unshift(rawQuery);
    }

    this.templateDosageSuggestions = filtered;
  }

  onTemplateMedicineSelect(event: any): void {
    const medicineName = this.normalizeName(event.value || event);
    if (medicineName && !this.isNameInList(medicineName, this.getMedicineNames())) {
      this.addMedicineToMaster(medicineName);
    }
  }

  onTemplateDosageSelect(event: any): void {
    const dosageName = this.normalizeName(event.value || event);
    if (dosageName && !this.isNameInList(dosageName, this.getDosageNames())) {
      this.addDosageToMaster(dosageName);
    }
  }

  addTemplateMedicineToMaster(medicine: DiagnosisTemplateMedicine): void {
    const medicineName = this.normalizeName(medicine.medicineName);
    if (!medicineName) {
      return;
    }

    medicine.medicineName = medicineName;
    this.addMedicineToMaster(medicineName);
  }

  addTemplateDosageToMaster(value?: string): void {
    this.addDosageToMaster(value);
  }

  isNewTemplateMedicine(value?: string): boolean {
    const medicineName = this.normalizeName(value);
    return !!medicineName && !this.isNameInList(medicineName, this.getMedicineNames());
  }

  isNewTemplateDosage(value?: string): boolean {
    const dosageName = this.normalizeName(value);
    return !!dosageName && !this.isNameInList(dosageName, this.getDosageNames());
  }

  private addMedicineToMaster(name: string): void {
    const medicineName = this.normalizeName(name);
    if (!medicineName || this.isNameInList(medicineName, this.getMedicineNames())) {
      return;
    }

    this.dataService.addMedicine(medicineName).subscribe({
      next: medicine => {
        this.medicines.push(medicine || { name: medicineName });
        this.templateMedicineSuggestions = this.getMedicineNames();
        this.applyFilter();
        this.showSuccess('Medicine added.');
      },
      error: err => this.showError(err.error?.message || 'Unable to add medicine.')
    });
  }

  private addDosageToMaster(value?: string): void {
    const dosageName = this.normalizeName(value);
    if (!dosageName || this.isNameInList(dosageName, this.getDosageNames())) {
      return;
    }

    this.dataService.addDosage(dosageName).subscribe({
      next: dosage => {
        this.dosages.push(dosage || { name: dosageName });
        this.templateDosageSuggestions = this.getDosageNames();
        this.showSuccess('Dosage added.');
      },
      error: err => this.showError(err.error?.message || 'Unable to add dosage.')
    });
  }

  private getMedicineNames(): string[] {
    return this.medicines.map(medicine => medicine.name).filter(Boolean);
  }

  private getDosageNames(): string[] {
    return this.dosages.map(dosage => dosage.name).filter(Boolean);
  }

  private isNameInList(value: string, list: string[]): boolean {
    const normalizedValue = this.normalizeName(value).toLowerCase();
    return !!normalizedValue && list.some(item => this.normalizeName(item).toLowerCase() === normalizedValue);
  }

  addMedicines(): void {
    const names = this.parseMedicineNames(this.medicineText);
    if (!names.length) {
      this.showWarn('Enter at least one medicine name.');
      return;
    }

    const existingNames = new Set(this.medicines.map(medicine => this.normalizeName(medicine.name).toLowerCase()));
    const newNames = names.filter(name => !existingNames.has(name.toLowerCase()));
    const skippedCount = names.length - newNames.length;

    if (!newNames.length) {
      this.showWarn('All entered medicines already exist.');
      return;
    }

    this.isSaving = true;
    forkJoin(newNames.map(name => this.dataService.addMedicine(name))).subscribe({
      next: () => {
        this.isSaving = false;
        this.medicineText = '';
        this.showSuccess(`Added ${newNames.length} medicine${newNames.length === 1 ? '' : 's'}${skippedCount ? `, skipped ${skippedCount}` : ''}.`);
        this.loadMedicines();
      },
      error: err => {
        this.isSaving = false;
        this.showError(err.error?.message || 'Unable to add medicines.');
      }
    });
  }

  exportMedicines(): void {
    if (!this.currentUser?.role) {
      this.showError('User session not found.');
      return;
    }

    this.isExporting = true;
    this.dataService.exportMedicinesExcel(this.currentUser.role).subscribe({
      next: blob => {
        this.isExporting = false;
        this.saveBlob(blob, 'ent-clinic-medicines.xlsx');
        this.showSuccess('Medicines exported.');
      },
      error: err => {
        this.isExporting = false;
        this.showError(err.error?.message || 'Unable to export medicines.');
      }
    });
  }

  importMedicines(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.showWarn('Select an .xlsx Excel file.');
      input.value = '';
      return;
    }

    if (!this.currentUser?.role) {
      this.showError('User session not found.');
      input.value = '';
      return;
    }

    this.isImporting = true;
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const fileBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

      this.dataService.importMedicinesExcel(this.currentUser!.role, file.name, fileBase64).subscribe({
        next: result => {
          this.isImporting = false;
          input.value = '';
          this.showSuccess(`Imported ${result.addedCount || 0} medicine${result.addedCount === 1 ? '' : 's'}${result.skippedCount ? `, skipped ${result.skippedCount}` : ''}.`);
          this.loadMedicines();
        },
        error: err => {
          this.isImporting = false;
          input.value = '';
          this.showError(err.error?.message || 'Unable to import medicines.');
        }
      });
    };

    reader.onerror = () => {
      this.isImporting = false;
      input.value = '';
      this.showError('Unable to read selected file.');
    };

    reader.readAsDataURL(file);
  }

  confirmDeleteMedicine(medicine: Medicine, event: Event): void {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: `Delete "${medicine.name}" from medicine master?`,
      header: 'Delete Medicine',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteMedicine(medicine.name)
    });
  }

  applyFilter(): void {
    const query = this.normalizeName(this.searchText).toLowerCase();
    this.filteredMedicines = query
      ? this.medicines.filter(medicine => medicine.name.toLowerCase().includes(query))
      : [...this.medicines];
  }

  private deleteMedicine(name: string): void {
    this.dataService.deleteMedicine(name).subscribe({
      next: () => {
        this.showSuccess('Medicine deleted.');
        this.loadMedicines();
      },
      error: err => this.showDeleteError(err)
    });
  }

  private parseMedicineNames(value: string): string[] {
    const seen = new Set<string>();

    return value
      .split(/[\n,;]+/)
      .map(name => this.normalizeName(name))
      .filter(name => {
        const key = name.toLowerCase();
        if (!name || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  private normalizeName(value: string | null | undefined): string {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(downloadUrl);
  }

  private showSuccess(detail: string): void {
    this.messageService.add({ severity: 'success', summary: 'Done', detail });
  }

  private showWarn(detail: string): void {
    this.messageService.add({ severity: 'warn', summary: 'Check', detail });
  }

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'Error', detail });
  }

  private showDeleteError(err: any): void {
    this.messageService.add({
      severity: err.status === 409 ? 'warn' : 'error',
      summary: err.status === 409 ? 'In Use' : 'Delete Failed',
      detail: err.error?.error || err.error?.message || 'Unable to delete medicine.'
    });
  }
}

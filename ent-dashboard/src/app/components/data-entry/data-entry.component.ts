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
import { Medicine } from '../../models/medicine.model';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data.service';

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
    ToastModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './data-entry.component.html'
})
export class DataEntryComponent implements OnInit {
  medicines: Medicine[] = [];
  filteredMedicines: Medicine[] = [];
  medicineText = '';
  searchText = '';
  isLoading = false;
  isSaving = false;
  isImporting = false;
  isExporting = false;
  currentUser: User | null = null;

  constructor(
    private authService: AuthService,
    private dataService: DataService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.loadMedicines();
  }

  loadMedicines(): void {
    this.isLoading = true;
    this.dataService.getMedicines().subscribe({
      next: medicines => {
        this.medicines = medicines;
        this.applyFilter();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.showError('Unable to load medicines.');
      }
    });
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

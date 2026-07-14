import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PatientHistory, PatientHistoryMedicine, PatientHistoryVisit } from '../../models/patient-history.model';
import { PatientService } from '../../services/patient.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

type GovernmentExportMode = 'daily' | 'monthly' | 'custom';
type GovernmentPaymentMode = 'QR' | 'Cash';

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
  isExporting = false;
  isSqlExporting = false;
  isSqlImporting = false;
  isSqlTableExporting = false;
  isSqlTableImporting = false;
  isBackupPanelOpen = false;
  isGovernmentExportOpen = false;
  isGovernmentExporting = false;
  errorMessage = '';
  exportMessage = '';
  exportError = '';
  governmentExportMessage = '';
  governmentExportError = '';
  governmentExportMode: GovernmentExportMode = 'daily';
  governmentExportDate = '';
  governmentExportMonth = '';
  governmentExportFrom = '';
  governmentExportTo = '';
  governmentExportPaymentModes: GovernmentPaymentMode[] = ['QR', 'Cash'];
  sqlMessage = '';
  sqlError = '';
  currentUser: User | null = null;

  constructor(
    private patientService: PatientService,
    private authService: AuthService,
    private datePipe: DatePipe
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.initializeGovernmentExportDates();
    this.showTodayHistory(false);
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

  showTodayHistory(load = true): void {
    const todayKey = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this.fromDate = todayKey;
    this.toDate = todayKey;

    if (load) {
      this.loadHistory();
    }
  }

  toggleBackupPanel(): void {
    this.isBackupPanelOpen = !this.isBackupPanelOpen;
    if (this.isBackupPanelOpen) {
      this.isGovernmentExportOpen = false;
    }
  }

  closeBackupPanel(): void {
    this.isBackupPanelOpen = false;
  }

  toggleGovernmentExportPanel(): void {
    this.isGovernmentExportOpen = !this.isGovernmentExportOpen;
    if (this.isGovernmentExportOpen) {
      this.isBackupPanelOpen = false;
    }
  }

  closeGovernmentExportPanel(): void {
    this.isGovernmentExportOpen = false;
  }

  setGovernmentExportMode(mode: GovernmentExportMode): void {
    this.governmentExportMode = mode;
    this.governmentExportMessage = '';
    this.governmentExportError = '';
  }

  isGovernmentPaymentModeSelected(paymentMode: GovernmentPaymentMode): boolean {
    return this.governmentExportPaymentModes.includes(paymentMode);
  }

  toggleGovernmentPaymentMode(paymentMode: GovernmentPaymentMode, checked: boolean): void {
    if (checked && !this.isGovernmentPaymentModeSelected(paymentMode)) {
      this.governmentExportPaymentModes = [...this.governmentExportPaymentModes, paymentMode];
    }

    if (!checked) {
      this.governmentExportPaymentModes = this.governmentExportPaymentModes.filter(mode => mode !== paymentMode);
    }

    this.governmentExportMessage = '';
    this.governmentExportError = '';
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

  get canExportBackup(): boolean {
    return this.currentUser?.role === 'doctor';
  }

  get canExportReport(): boolean {
    return !!this.currentUser && this.authService.hasTabAccess(this.currentUser.role, 'history');
  }

  get canImportSqlBackup(): boolean {
    return this.currentUser?.role === 'admin';
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
    if (status === 'Exited') {
      return 'bg-red-100 text-red-700 border-red-200';
    }

    if (status === 'Payment Done') {
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }

    if (status === 'In Consultation') {
      return 'bg-blue-100 text-blue-700 border-blue-200';
    }

    return 'bg-amber-100 text-amber-700 border-amber-200';
  }

  getPaymentClass(paymentMode?: string | null): string {
    if (!paymentMode) {
      return 'bg-slate-100 text-slate-500';
    }

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

  exportBackup(): void {
    if (!this.canExportBackup || !this.currentUser) {
      return;
    }

    this.isExporting = true;
    this.exportMessage = '';
    this.exportError = '';

    this.patientService.exportPatientHistoryBackup(this.currentUser.role).subscribe({
      next: (result) => {
        this.patientService.downloadPatientHistoryBackup(this.currentUser!.role).subscribe({
          next: (blob) => {
            this.saveBlob(blob, result.fileName || 'ent-clinic-patient-history-backup.xlsx');
            this.exportMessage = this.buildExportMessage(result.affectedDates || [], result.refreshedSheets || []);
            this.isExporting = false;
          },
          error: (err) => {
            console.error('Failed to download patient history backup', err);
            this.exportError = 'Backup was created, but download failed.';
            this.isExporting = false;
          }
        });
      },
      error: (err) => {
        console.error('Failed to export patient history backup', err);
        this.exportError = err.error?.message || 'Unable to export patient history backup.';
        this.isExporting = false;
      }
    });
  }

  exportGovernmentReport(): void {
    if (!this.canExportReport || !this.currentUser) {
      return;
    }

    const range = this.getGovernmentExportRange();
    this.governmentExportMessage = '';
    this.governmentExportError = '';

    if (!range) {
      this.governmentExportError = 'Select a valid export date range.';
      return;
    }

    if (this.governmentExportPaymentModes.length === 0) {
      this.governmentExportError = 'Select at least one payment mode.';
      return;
    }

    this.isGovernmentExporting = true;
    const filters = {
      ...range,
      paymentModes: this.governmentExportPaymentModes
    };

    this.patientService.exportGovernmentReport(this.currentUser.role, this.currentUser.id, filters).subscribe({
      next: (blob) => {
        this.saveBlob(blob, `ent-clinic-government-report-${range.fromDate}-to-${range.toDate}.xlsx`);
        this.governmentExportMessage = 'Government report downloaded.';
        this.isGovernmentExporting = false;
      },
      error: (err) => {
        console.error('Failed to export government report', err);
        this.governmentExportError = err.error?.message || 'Unable to export government report.';
        this.isGovernmentExporting = false;
      }
    });
  }

  exportSqlBackup(): void {
    if (!this.canExportBackup || !this.currentUser) {
      return;
    }

    this.isSqlExporting = true;
    this.sqlMessage = '';
    this.sqlError = '';

    this.patientService.exportSqlBackup(this.currentUser.role).subscribe({
      next: (result) => {
        this.patientService.downloadSqlBackup(this.currentUser!.role).subscribe({
          next: (blob) => {
            this.saveBlob(blob, result.fileName || 'ent-clinic-full-database-backup.sql');
            this.sqlMessage = `SQL backup downloaded with ${result.tableCount || 0} tables.`;
            this.isSqlExporting = false;
          },
          error: (err) => {
            console.error('Failed to download SQL backup', err);
            this.sqlError = 'SQL backup was created, but download failed.';
            this.isSqlExporting = false;
          }
        });
      },
      error: (err) => {
        console.error('Failed to export SQL backup', err);
        this.sqlError = err.error?.message || 'Unable to export SQL backup.';
        this.isSqlExporting = false;
      }
    });
  }

  async exportSqlTableBackups(): Promise<void> {
    if (!this.canExportBackup || !this.currentUser) {
      return;
    }

    this.isSqlTableExporting = true;
    this.sqlMessage = '';
    this.sqlError = '';

    try {
      const result = await firstValueFrom(this.patientService.exportSqlTableBackups(this.currentUser.role));
      const files = result.files || [];

      for (const file of files) {
        const blob = await firstValueFrom(this.patientService.downloadSqlTableBackup(this.currentUser.role, file.table));
        this.saveBlob(blob, file.fileName || `ent-clinic-${file.table}.sql`);
      }

      this.sqlMessage = `Table SQL backup downloaded with ${files.length || 0} table file${files.length === 1 ? '' : 's'}. Import users.sql manually, then use Import Tables for the rest.`;
    } catch (err: any) {
      console.error('Failed to export SQL table backups', err);
      this.sqlError = err.error?.message || 'Unable to export SQL table backups.';
    } finally {
      this.isSqlTableExporting = false;
    }
  }

  importSqlBackup(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file || !this.currentUser || !this.canImportSqlBackup) {
      return;
    }

    const confirmed = window.confirm(
      'Importing this SQL backup will replace current clinic data, including admin username/password. Continue?'
    );
    if (!confirmed) {
      return;
    }

    this.isSqlImporting = true;
    this.sqlMessage = '';
    this.sqlError = '';

    const reader = new FileReader();
    reader.onload = () => {
      const sql = String(reader.result || '');
      this.patientService.importSqlBackup(this.currentUser!.role, sql).subscribe({
        next: (result) => {
          this.sqlMessage = `SQL backup imported successfully. ${result.tableCount || 0} tables restored.`;
          this.isSqlImporting = false;
          this.loadHistory();
        },
        error: (err) => {
          console.error('Failed to import SQL backup', err);
          this.sqlError = err.error?.message || 'Unable to import SQL backup.';
          this.isSqlImporting = false;
        }
      });
    };
    reader.onerror = () => {
      this.sqlError = 'Unable to read selected SQL file.';
      this.isSqlImporting = false;
    };
    reader.readAsText(file);
  }

  async importSqlTableBackups(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';

    if (files.length === 0 || !this.currentUser || !this.canImportSqlBackup) {
      return;
    }

    const hasUsersFile = files.some(file => file.name.toLowerCase().includes('users'));
    if (hasUsersFile) {
      this.sqlError = 'users.sql must be imported manually. Select only non-user table SQL files here.';
      this.sqlMessage = '';
      return;
    }

    const confirmed = window.confirm(
      'Importing these table SQL files will replace selected non-user clinic tables. Import users.sql manually first if needed. Continue?'
    );
    if (!confirmed) {
      return;
    }

    this.isSqlTableImporting = true;
    this.sqlMessage = '';
    this.sqlError = '';

    try {
      const sqlFiles = await Promise.all(
        files.map(async file => ({
          fileName: file.name,
          sql: await file.text()
        }))
      );

      const result = await firstValueFrom(
        this.patientService.importSqlTableBackups(this.currentUser.role, sqlFiles)
      );
      const importedTables = result.importedTables?.join(', ') || 'selected tables';
      this.sqlMessage = `Table SQL imported successfully. Restored ${result.tableCount || 0} table${result.tableCount === 1 ? '' : 's'}: ${importedTables}.`;
      this.loadHistory();
    } catch (err: any) {
      console.error('Failed to import SQL table backups', err);
      this.sqlError = err.error?.message || 'Unable to import SQL table backups.';
    } finally {
      this.isSqlTableImporting = false;
    }
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(downloadUrl);
  }

  private initializeGovernmentExportDates(): void {
    const todayKey = this.getTodayKey();
    this.governmentExportDate = todayKey;
    this.governmentExportMonth = this.getCurrentMonthKey();
    this.governmentExportFrom = todayKey;
    this.governmentExportTo = todayKey;
  }

  private getGovernmentExportRange(): { fromDate: string; toDate: string } | null {
    if (this.governmentExportMode === 'daily') {
      return this.isValidDateKey(this.governmentExportDate)
        ? { fromDate: this.governmentExportDate, toDate: this.governmentExportDate }
        : null;
    }

    if (this.governmentExportMode === 'monthly') {
      const monthMatch = this.governmentExportMonth.match(/^(\d{4})-(\d{2})$/);
      if (!monthMatch) {
        return null;
      }

      const year = Number(monthMatch[1]);
      const month = Number(monthMatch[2]);
      if (month < 1 || month > 12) {
        return null;
      }

      const fromDate = `${this.governmentExportMonth}-01`;
      const toDate = this.datePipe.transform(new Date(year, month, 0), 'yyyy-MM-dd') || '';
      return this.isValidDateKey(toDate) ? { fromDate, toDate } : null;
    }

    if (!this.isValidDateKey(this.governmentExportFrom) || !this.isValidDateKey(this.governmentExportTo)) {
      return null;
    }

    if (this.governmentExportFrom > this.governmentExportTo) {
      return null;
    }

    return { fromDate: this.governmentExportFrom, toDate: this.governmentExportTo };
  }

  private getTodayKey(): string {
    return this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
  }

  private getCurrentMonthKey(): string {
    return this.datePipe.transform(new Date(), 'yyyy-MM') || '';
  }

  private isValidDateKey(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private buildExportMessage(affectedDates: string[], refreshedSheets: string[]): string {
    const dateCount = affectedDates.length;
    const sheetCount = refreshedSheets.length;

    if (dateCount === 0) {
      return `Backup downloaded. No visit date sheets needed refresh; ${sheetCount} workbook sheet${sheetCount === 1 ? '' : 's'} checked/refreshed.`;
    }

    return `Backup downloaded. Refreshed ${dateCount} visit date sheet${dateCount === 1 ? '' : 's'} and ${sheetCount} workbook sheet${sheetCount === 1 ? '' : 's'}.`;
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

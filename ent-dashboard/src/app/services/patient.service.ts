import { Injectable } from '@angular/core';
import { Patient } from '../models/patient.model';
import { PatientHistory } from '../models/patient-history.model';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PatientService {
  private apiUrl = `${environment.apiUrl}/patients`;

  constructor(private http: HttpClient) { }

  getPatientsByDate(date: string): Observable<Patient[]> {
    const params = new HttpParams().set('date', date);
    return this.http.get<Patient[]>(this.apiUrl, { params });
  }

  getPatientDateSummaries(): Observable<Array<{ date: string; count: number }>> {
    return this.http.get<Array<{ date: string; count: number }>>(`${this.apiUrl}/date-summaries`);
  }

  searchPatientHistory(filters: { search?: string; from?: string; to?: string } = {}): Observable<PatientHistory[]> {
    let params = new HttpParams();

    if (filters.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters.from) {
      params = params.set('from', filters.from);
    }

    if (filters.to) {
      params = params.set('to', filters.to);
    }

    return this.http.get<PatientHistory[]>(`${this.apiUrl}/history`, { params });
  }

  exportPatientHistoryBackup(role: string): Observable<{
    message: string;
    fileName: string;
    affectedDates: string[];
    refreshedSheets: string[];
    downloadUrl: string;
  }> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.post<{
      message: string;
      fileName: string;
      affectedDates: string[];
      refreshedSheets: string[];
      downloadUrl: string;
    }>(`${environment.apiUrl}/export/patient-history`, {}, { headers });
  }

  downloadPatientHistoryBackup(role: string): Observable<Blob> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.get(`${environment.apiUrl}/export/patient-history/download`, {
      headers,
      responseType: 'blob'
    });
  }

  exportGovernmentReport(role: string, userId: string, filters: { fromDate: string; toDate: string; paymentModes: string[] }): Observable<Blob> {
    const headers = new HttpHeaders()
      .set('x-user-role', role)
      .set('x-user-id', userId);
    return this.http.post(`${environment.apiUrl}/export/government-report`, filters, {
      headers,
      responseType: 'blob'
    });
  }

  exportSqlBackup(role: string): Observable<{
    message: string;
    fileName: string;
    tableCount: number;
    downloadUrl: string;
  }> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.post<{
      message: string;
      fileName: string;
      tableCount: number;
      downloadUrl: string;
    }>(`${environment.apiUrl}/export/sql`, {}, { headers });
  }

  downloadSqlBackup(role: string): Observable<Blob> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.get(`${environment.apiUrl}/export/sql/download`, {
      headers,
      responseType: 'blob'
    });
  }

  exportSqlTableBackups(role: string): Observable<{
    message: string;
    tableCount: number;
    files: Array<{ table: string; fileName: string; downloadUrl: string }>;
  }> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.post<{
      message: string;
      tableCount: number;
      files: Array<{ table: string; fileName: string; downloadUrl: string }>;
    }>(`${environment.apiUrl}/export/sql/tables`, {}, { headers });
  }

  downloadSqlTableBackup(role: string, table: string): Observable<Blob> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.get(`${environment.apiUrl}/export/sql/tables/${table}/download`, {
      headers,
      responseType: 'blob'
    });
  }

  importSqlBackup(role: string, sql: string): Observable<{
    message: string;
    statementCount: number;
    tableCount: number;
  }> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.post<{
      message: string;
      statementCount: number;
      tableCount: number;
    }>(`${environment.apiUrl}/export/sql/import`, { sql }, { headers });
  }

  importSqlTableBackups(role: string, files: Array<{ fileName: string; sql: string }>): Observable<{
    message: string;
    statementCount: number;
    tableCount: number;
    importedTables: string[];
  }> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.post<{
      message: string;
      statementCount: number;
      tableCount: number;
      importedTables: string[];
    }>(`${environment.apiUrl}/export/sql/tables/import`, { files }, { headers });
  }

  saveOrUpdatePatient(patient: Patient): Observable<any> {
    if (patient.id && patient.id > 0) {
      // Update not fully implemented in backend for full details, only status/diagnosis
      // But for now let's assume create for new ones. 
      // If we need update details, I should have added it.
      // Let's rely on Create for registration.
      console.warn('Update patient details not fully implemented in backend yet');
      return this.http.patch(`${this.apiUrl}/${patient.id}/status`, { status: patient.status });
    } else {
      return this.http.post(this.apiUrl, patient);
    }
  }

  createPatient(patient: Patient): Observable<any> {
    return this.http.post(this.apiUrl, patient);
  }

  registerPatientVisit(patient: Patient): Observable<any> {
    return this.http.post(`${this.apiUrl}/${patient.id}/visit`, patient);
  }

  updateStatus(id: number, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/status`, { status });
  }

  updatePatient(patient: Patient): Observable<any> {
    return this.http.put(`${this.apiUrl}/${patient.id}`, patient);
  }

  deletePatient(id: number, date?: string, role?: string): Observable<any> {
    const options = {
      params: date ? new HttpParams().set('date', date) : undefined,
      headers: role ? new HttpHeaders().set('x-user-role', role) : undefined
    };
    return this.http.delete(`${this.apiUrl}/${id}`, options);
  }

  getNextToken(date?: string): Observable<any> {
    const options = date ? { params: new HttpParams().set('date', date) } : {};
    return this.http.get(`${this.apiUrl}/next-token`, options);
  }

  getPatientById(id: number): Observable<Patient> {
    return this.http.get<Patient>(`${this.apiUrl}/${id}`);
  }

  getPatientByCode(patientCode: string): Observable<Patient> {
    return this.http.get<Patient>(`${this.apiUrl}/by-code/${encodeURIComponent(patientCode)}`);
  }

  addPrescription(prescription: any): Observable<any> {
    // Assuming the backend endpoint is POST /api/patients/:id/prescriptions
    // and prescription object contains patientId
    if (!prescription.patientId) {
      throw new Error('Patient ID is required for prescription');
    }
    return this.http.post(`${this.apiUrl}/${prescription.patientId}/prescriptions`, prescription);
  }
}

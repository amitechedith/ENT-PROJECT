import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Patient } from '../models/patient.model';
import { Prescription } from '../models/prescription.model';
import { PrescriptionMedicine } from '../models/prescription-medicine.model';
import { Medicine } from '../models/medicine.model';
import { Diagnosis } from '../models/diagnosis.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getPatients(): Observable<Patient[]> {
    return this.http.get<Patient[]>(`${this.apiUrl}/patients`);
  }

  getPatientById(patientId: number): Observable<Patient> {
    return this.http.get<Patient>(`${this.apiUrl}/patients/${patientId}`);
  }

  updatePatient(patient: Patient): Observable<any> {
    return this.http.put(`${this.apiUrl}/patients/${patient.id}`, patient);
  }

  getPatientsByDate(date: string): Observable<Patient[]> {
    const params = new HttpParams().set('date', date);
    return this.http.get<Patient[]>(`${this.apiUrl}/patients`, { params });
  }

  getPatientDateSummaries(): Observable<Array<{ date: string; count: number }>> {
    return this.http.get<Array<{ date: string; count: number }>>(`${this.apiUrl}/patients/date-summaries`);
  }

  // Prescriptions are now linked to patients in backend. 
  // We can fetch by patient ID.
  getPatientPrescriptions(patientId: number): Observable<Prescription[]> {
    return this.http.get<Prescription[]>(`${this.apiUrl}/patients/${patientId}/prescriptions`);
  }

  savePrescription(patientId: number, prescriptionData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/patients/${patientId}/prescriptions`, prescriptionData);
  }

  // Deprecated individual getters if not used directly, but keeping for compatibility if logic needs them
  // getPrescriptions(): Observable<Prescription[]> { return ... }
  // getPrescriptionMedicines(): Observable<... > { return ... }
  // Instead, we will rely on getPatientPrescriptions which returns nested medicines.

  getMedicines(): Observable<Medicine[]> {
    return this.http.get<Medicine[]>(`${this.apiUrl}/master/medicines`);
  }

  getDiagnosisList(): Observable<Diagnosis[]> {
    return this.http.get<Diagnosis[]>(`${this.apiUrl}/master/diagnoses`);
  }

  addMedicine(name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/master/medicines`, { name });
  }

  deleteMedicine(name: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/master/medicines?name=${encodeURIComponent(name)}`);
  }

  exportMedicinesExcel(role: string): Observable<Blob> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.get(`${this.apiUrl}/master/medicines/export`, {
      headers,
      responseType: 'blob'
    });
  }

  importMedicinesExcel(role: string, fileName: string, fileBase64: string): Observable<{
    message: string;
    addedCount: number;
    skippedCount: number;
    totalRows: number;
  }> {
    const headers = new HttpHeaders().set('x-user-role', role);
    return this.http.post<{
      message: string;
      addedCount: number;
      skippedCount: number;
      totalRows: number;
    }>(`${this.apiUrl}/master/medicines/import`, { fileName, fileBase64 }, { headers });
  }

  addDiagnosis(name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/master/diagnoses`, { name });
  }

  deleteDiagnosis(name: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/master/diagnoses?name=${encodeURIComponent(name)}`);
  }

  getDosagesList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/master/dosages`);
  }

  addDosage(name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/master/dosages`, { name });
  }

  deleteDosage(name: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/master/dosages?name=${encodeURIComponent(name)}`);
  }

  updatePatientDiagnosis(patientId: number, diagnoses: string[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/patients/${patientId}/diagnosis`, { diagnoses });
  }
}

import { Injectable } from '@angular/core';
import { Patient } from '../models/patient.model';
import { HttpClient, HttpParams } from '@angular/common/http';
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

  updateStatus(id: number, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/status`, { status });
  }

  updatePatient(patient: Patient): Observable<any> {
    return this.http.put(`${this.apiUrl}/${patient.id}`, patient);
  }

  deletePatient(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getNextToken(): Observable<any> {
    return this.http.get(`${this.apiUrl}/next-token`);
  }

  getPatientById(id: number): Observable<Patient> {
    return this.http.get<Patient>(`${this.apiUrl}/${id}`);
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

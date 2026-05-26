import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

  addDiagnosis(name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/master/diagnoses`, { name });
  }

  getDosagesList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/master/dosages`);
  }

  addDosage(name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/master/dosages`, { name });
  }

  updatePatientDiagnosis(patientId: number, diagnoses: string[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/patients/${patientId}/diagnosis`, { diagnoses });
  }
}

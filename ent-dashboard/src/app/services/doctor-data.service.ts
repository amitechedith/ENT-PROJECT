import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DataService } from './data.service';
import { Patient } from '../models/patient.model';
import { Medicine } from '../models/medicine.model';
import { Diagnosis } from '../models/diagnosis.model';

@Injectable({
  providedIn: 'root'
})
export class DoctorDataService {
  constructor(private dataService: DataService) { }

  getPatientsByDate(date: string): Observable<Patient[]> {
    return this.dataService.getPatientsByDate(date);
  }

  getPatientDateSummaries(): Observable<Array<{ date: string; count: number }>> {
    return this.dataService.getPatientDateSummaries();
  }

  getPatientById(id: number): Observable<Patient> {
    return this.dataService.getPatientById(id);
  }

  updatePatient(patient: Patient): Observable<any> {
    return this.dataService.updatePatient(patient);
  }

  getPatientPrescriptions(patientId: number): Observable<any[]> {
    return this.dataService.getPatientPrescriptions(patientId);
  }

  /**
   * Load all available medicines
   */
  getAllMedicines(): Observable<Medicine[]> {
    return this.dataService.getMedicines();
  }

  // Fetch diagnosis list from backend and convert to PrimeNG format
  getDiagnosisList(): Observable<any[]> {
    return this.dataService.getDiagnosisList().pipe(
      map((response: any[]) => {
        return response.map(item => ({
          label: item.name,
          value: item.name
        }));
      })
    );
  }

  savePrescription(patientId: number, data: any): Observable<any> {
    return this.dataService.savePrescription(patientId, data);
  }

  addMedicine(name: string): Observable<any> {
    return this.dataService.addMedicine(name);
  }

  deleteMedicine(name: string): Observable<any> {
    return this.dataService.deleteMedicine(name);
  }

  addDiagnosis(name: string): Observable<any> {
    return this.dataService.addDiagnosis(name);
  }

  deleteDiagnosis(name: string): Observable<any> {
    return this.dataService.deleteDiagnosis(name);
  }

  getDosagesList(): Observable<any[]> {
    return this.dataService.getDosagesList();
  }

  addDosage(name: string): Observable<any> {
    return this.dataService.addDosage(name);
  }

  deleteDosage(name: string): Observable<any> {
    return this.dataService.deleteDosage(name);
  }

  updatePatientDiagnosis(patientId: number, diagnoses: string[]): Observable<any> {
    return this.dataService.updatePatientDiagnosis(patientId, diagnoses);
  }
}

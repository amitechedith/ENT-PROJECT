import { Injectable } from '@angular/core';
import { Observable, forkJoin, map, switchMap, of, catchError } from 'rxjs';
import { DataService } from './data.service';
import { Patient } from '../models/patient.model';
import { Medicine } from '../models/medicine.model';
import { Diagnosis } from '../models/diagnosis.model';

@Injectable({
  providedIn: 'root'
})
export class DoctorDataService {
  constructor(private dataService: DataService) { }

  /**
   * Load patients along with their prescriptions and prescription medicines.
   */
  getTodaysPatients(): Observable<Patient[]> {
    return this.dataService.getPatients().pipe(
      switchMap(patients => {
        if (patients.length === 0) return of([]);
        // For each patient, fetch prescriptions
        // Note: In production with many patients, this N+1 is bad. 
        // Backend should ideally return a summary or we fetch purely on demand.
        // For now, to keep dashboard logic working (it shows history immediately), we fetch.

        const requests = patients.map(patient =>
          this.dataService.getPatientPrescriptions(patient.id!).pipe(
            map(prescriptions => ({ ...patient, prescriptions })),
            // If getting prescriptions fails (e.g. 404 or empty), returns patient with empty array
            catchError(() => of({ ...patient, prescriptions: [] }))
          )
        );

        return forkJoin(requests);
      })
    );
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

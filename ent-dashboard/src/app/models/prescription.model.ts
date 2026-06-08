import { PrescriptionMedicine } from './prescription-medicine.model';

export interface Prescription {
  id?: number;
  patientId: number;
  date: string;                       // yyyy-MM-dd
  nextVisitDate?: string | null;
  notes: string;
  medicines: PrescriptionMedicine[];  // per-prescription medicine entries
  consultationFee: number;            // fee for that visit
}

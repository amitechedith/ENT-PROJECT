import { PrescriptionMedicine } from './prescription-medicine.model';

export interface Prescription {
  id?: number;
  patientId: number;
  date: string;                       // ISO string
  notes: string;
  medicines: PrescriptionMedicine[];  // per-prescription medicine entries
  consultationFee: number;            // fee for that visit
}

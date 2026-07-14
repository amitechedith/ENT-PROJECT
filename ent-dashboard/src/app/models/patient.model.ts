import { Prescription } from './prescription.model';

export interface Patient {
  id?: number;
  patientCode?: string;
  name: string;
  gender?: string;
  mobile?: string;
  age?: number;
  visitReason?: string;
  status?: string;
  paymentMode?: 'Cash' | 'QR' | null;
  currentDiagnosis?: string[];
  medicalBackground?: string;
  latestVisitDate?: string;
  prescriptions?: Prescription[];
  tokenNumber?: number;
  consultationFee?: number;
}

export interface PatientHistoryMedicine {
  id?: number;
  medicineId?: number | null;
  medicineName?: string | null;
  dosage?: string | null;
  duration?: string | null;
  instructions?: string | null;
}

export interface PatientHistoryVisit {
  date: string;
  visitReason?: string | null;
  status?: string | null;
  paymentMode?: 'Cash' | 'QR' | string | null;
  consultationFee?: number | string | null;
  tokenNumber?: number | null;
  diagnoses: string[];
  notes?: string | null;
  nextVisitDate?: string | null;
  prescriptionId?: number | null;
  medicines: PatientHistoryMedicine[];
}

export interface PatientHistory {
  id: number;
  name: string;
  age?: number | null;
  gender?: string | null;
  mobile?: string | null;
  medicalBackground?: string | null;
  latestVisitDate?: string | null;
  currentDiagnosis: string[];
  visits: PatientHistoryVisit[];
}

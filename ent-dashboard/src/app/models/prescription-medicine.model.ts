// Represents one medicine entry inside a prescription
export interface PrescriptionMedicine {
  prescriptionId: number; // id from Prescription
  medicineId: number | undefined;   // id from MedicineOption
  dosage: string;       // e.g. "1-0-1"
  daysToTake: number;   // e.g. 5
  medicineName?: string; // Optional custom name
}

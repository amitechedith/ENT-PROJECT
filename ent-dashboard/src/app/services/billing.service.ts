// src/app/services/billing.service.ts
import { Injectable } from '@angular/core';
import { Patient } from '../models/patient.model';
import { Prescription } from '../models/prescription.model';
import { Observable, of } from 'rxjs';

export interface BillItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface BillSummary {
  patientName: string;
  patientId: number;
  date: string;
  items: BillItem[];
  totalAmount: number;
}

@Injectable({ providedIn: 'root' })
export class BillingService {

  constructor() {}

  generateBill(patient: Patient): Observable<BillSummary> {
    if (!patient.prescriptions?.length) {
      return of({
        patientName: patient.name,
        patientId: patient.id || 0,
        date: new Date().toISOString(),
        items: [],
        totalAmount: 0
      });
    }

    // const items: BillItem[] = patient.prescriptions.flatMap((pres: Prescription) =>
    //   pres.medicines.map(med => ({
    //     name: med.name,
    //     quantity: med.quantity,
    //     price: med.price,
    //     total: med.quantity * med.price
    //   }))
    // );

    // const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

    return of({
      patientName: patient.name,
      patientId: patient.id || 0,
      date: new Date().toISOString(),
      items: [] ,
      totalAmount: 0
    });
  }
}

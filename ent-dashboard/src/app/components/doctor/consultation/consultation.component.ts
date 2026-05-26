import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PatientService } from '../../../services/patient.service';
import { Patient } from '../../../models/patient.model';
import { Prescription } from '../../../models/prescription.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-consultation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consultation.component.html'
})
export class ConsultationComponent implements OnInit {
  patient?: Patient;
  newPrescription: Prescription = { patientId: 0, medicines: [], notes: '', date: new Date().toISOString(), consultationFee: 0 };

  constructor(private route: ActivatedRoute, private patientService: PatientService) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.patientService.getPatientById(id).subscribe(p => {
      this.patient = p;
      this.newPrescription.patientId = id;
    });
  }

  addMedicine() {
    // this.newPrescription.medicines.push({ name: '', quantity: 1, price: 0 });
  }

  savePrescription() {
    this.patientService.addPrescription(this.newPrescription).subscribe(() => alert('Saved!'));
  }
}

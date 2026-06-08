import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PatientService } from '../../../services/patient.service';
import { Patient } from '../../../models/patient.model';
import { Prescription } from '../../../models/prescription.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-consultation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './consultation.component.html'
})
export class ConsultationComponent implements OnInit {
  patient?: Patient;
  newPrescription: Prescription = { patientId: 0, medicines: [], notes: '', date: '', consultationFee: 0 };

  constructor(private route: ActivatedRoute, private patientService: PatientService, private datePipe: DatePipe) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.patientService.getPatientById(id).subscribe(p => {
      this.patient = p;
      this.newPrescription.patientId = id;
      this.newPrescription.date = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    });
  }

  addMedicine() {
    // this.newPrescription.medicines.push({ name: '', quantity: 1, price: 0 });
  }

  savePrescription() {
    this.patientService.addPrescription(this.newPrescription).subscribe(() => alert('Saved!'));
  }
}

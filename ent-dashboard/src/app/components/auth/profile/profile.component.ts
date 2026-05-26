import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, CardModule],
    templateUrl: './profile.component.html'
})
export class ProfileComponent implements OnInit {
    profileForm!: FormGroup;
    currentUser: User | null = null;
    loading = false;

    constructor(
        private fb: FormBuilder,
        private authService: AuthService
    ) { }

    ngOnInit() {
        this.currentUser = this.authService.currentUserValue;
        this.initForm();
    }

    initForm() {
        this.profileForm = this.fb.group({
            username: [{ value: this.currentUser?.username, disabled: true }],
            role: [{ value: this.currentUser?.role, disabled: true }],
            fullName: [this.currentUser?.fullName, Validators.required],
            mobile: [this.currentUser?.mobile || '', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
            password: [this.currentUser?.password, Validators.required]
        });
    }

    updateProfile() {
        if (this.profileForm.valid && this.currentUser) {
            const formVal = this.profileForm.getRawValue(); // use getRawValue to include disabled fields if needed

            const updatedUser: User = {
                ...this.currentUser,
                fullName: formVal.fullName,
                mobile: formVal.mobile,
                password: formVal.password
            };

            this.authService.saveUserAsync(updatedUser).subscribe({
                next: () => {
                    alert('Profile updated successfully!');
                },
                error: (err) => {
                    alert('Failed to update profile.');
                }
            });
        }
    }
}

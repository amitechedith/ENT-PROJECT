import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { PasswordModule } from 'primeng/password';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, ButtonModule, InputTextModule, DialogModule, DropdownModule, PasswordModule, ConfirmDialogModule, ToastModule],
    providers: [ConfirmationService, MessageService],
    templateUrl: './admin-dashboard.component.html'
})
export class AdminDashboardComponent implements OnInit {
    users: User[] = [];
    allUsers: User[] = [];
    displayDialog: boolean = false;
    editingUser: { [key: string]: boolean } = {}; // Track which user is being edited
    userForm!: FormGroup;
    currentUser: User | null = null;
    roles = [
        { label: 'Doctor', value: 'doctor' },
        { label: 'Receptionist', value: 'receptionist' },
        { label: 'Prescription', value: 'billing' },
        { label: 'Admin', value: 'admin' }
    ];

    constructor(
        private authService: AuthService,
        private fb: FormBuilder,
        private confirmationService: ConfirmationService,
        private messageService: MessageService
    ) { }

    ngOnInit() {
        this.currentUser = this.authService.currentUserValue;
        this.loadUsers();
        this.userForm = this.fb.group({
            id: [null], // For edit mode
            username: ['', Validators.required],
            password: ['', Validators.required],
            confirmPassword: ['', Validators.required],
            fullName: ['', Validators.required],
            role: ['doctor', Validators.required],
            mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
            doctorTitle: [''],
            doctorRegistrationNumber: [''],
            doctorClinicAddress: [''],
            doctorClinicPhone: [''],
            doctorEmail: [''],
            doctorTimings: ['']
        }, { validators: this.passwordMatchValidator });

        this.userForm.get('role')?.valueChanges.subscribe(() => this.updateDoctorFieldValidators());
        this.updateDoctorFieldValidators();
    }

    get canManageAdmins(): boolean {
        return this.currentUser?.role === 'admin';
    }

    get availableRoles() {
        return this.canManageAdmins
            ? this.roles
            : this.roles.filter(role => role.value !== 'admin');
    }

    displayRoleLabel(role: string): string {
        return role === 'billing' ? 'Prescription' : role;
    }

    passwordMatchValidator(form: FormGroup) {
        const password = form.get('password');
        const confirmPassword = form.get('confirmPassword');
        return password && confirmPassword && password.value === confirmPassword.value ? null : { mismatch: true };
    }

    get isDoctorRole(): boolean {
        return this.userForm?.get('role')?.value === 'doctor';
    }

    private updateDoctorFieldValidators() {
        const doctorFields = [
            'doctorTitle',
            'doctorRegistrationNumber',
            'doctorClinicAddress',
            'doctorClinicPhone',
            'doctorEmail',
            'doctorTimings'
        ];

        doctorFields.forEach(fieldName => {
            const control = this.userForm.get(fieldName);
            if (!control) {
                return;
            }

            if (this.isDoctorRole) {
                control.setValidators(fieldName === 'doctorEmail'
                    ? [Validators.required, Validators.email]
                    : [Validators.required]);
            } else {
                control.clearValidators();
                control.setValue('');
            }

            control.updateValueAndValidity({ emitEvent: false });
        });
    }

    isInvalid(fieldName: string): boolean {
        const control = this.userForm.get(fieldName);
        return !!control && control.invalid && (control.touched || control.dirty);
    }

    loadUsers() {
        this.authService.getUsers().subscribe(users => {
            this.allUsers = users;
            this.users = this.filterVisibleUsers(users);
        });
    }

    private filterVisibleUsers(users: User[]): User[] {
        if (this.canManageAdmins) {
            return users;
        }

        return users.filter(user => user.role !== 'admin');
    }

    showDialog(user?: User) {
        this.displayDialog = true;
        if (user) {
            // Edit Mode
            this.userForm.patchValue({
                id: user.id,
                username: user.username,
                password: user.password || '',
                confirmPassword: user.password || '', // Pre-fill match
                fullName: user.fullName,
                role: user.role,
                mobile: user.mobile,
                doctorTitle: user.doctorTitle || '',
                doctorRegistrationNumber: user.doctorRegistrationNumber || '',
                doctorClinicAddress: user.doctorClinicAddress || '',
                doctorClinicPhone: user.doctorClinicPhone || '',
                doctorEmail: user.doctorEmail || '',
                doctorTimings: user.doctorTimings || ''
            });
        } else {
            // Create Mode
            this.userForm.reset({ role: 'doctor' });
            this.userForm.get('id')?.setValue(null);
        }

        if (!this.canManageAdmins && this.userForm.get('role')?.value === 'admin') {
            this.userForm.get('role')?.setValue('doctor');
        }

        this.updateDoctorFieldValidators();
    }

    saveUser() {
        if (this.userForm.valid) {
            const formVal = this.userForm.value;
            const newUser: User = {
                id: formVal.id, // Keep null/undefined if new
                username: formVal.username,
                password: formVal.password,
                fullName: formVal.fullName,
                role: formVal.role,
                mobile: formVal.mobile,
                doctorTitle: formVal.role === 'doctor' ? formVal.doctorTitle : undefined,
                doctorRegistrationNumber: formVal.role === 'doctor' ? formVal.doctorRegistrationNumber : undefined,
                doctorClinicAddress: formVal.role === 'doctor' ? formVal.doctorClinicAddress : undefined,
                doctorClinicPhone: formVal.role === 'doctor' ? formVal.doctorClinicPhone : undefined,
                doctorEmail: formVal.role === 'doctor' ? formVal.doctorEmail : undefined,
                doctorTimings: formVal.role === 'doctor' ? formVal.doctorTimings : undefined
            };

            // Logic to determine if create or update is handled in Service or here
            // Service's saveUserAsync handles the logic based on presence of ID or type of request needed.
            // Since we overwrote saveUser to return boolean (deprecated), we should use the new async methods or logic.
            // But I removed the boolean return method in previous step, so let's use what I put there: saveUserAsync

            this.authService.saveUserAsync(newUser).subscribe({
                next: (res) => {
                    this.displayDialog = false;
                    this.loadUsers();
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'User saved successfully',
                        life: 3000
                    });
                },
                error: (err) => {
                    alert(err.error?.message || 'Error saving user');
                }
            });
        }
    }

    deleteUser(user: User) {
        if (!this.canManageAdmins && user.role === 'admin') {
            this.messageService.add({
                severity: 'warn',
                summary: 'Not allowed',
                detail: 'Doctors cannot delete admin users.',
                life: 3000
            });
            return;
        }

        this.confirmationService.confirm({
            message: `Are you sure you want to delete user "${user.fullName}" (${user.username})?`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.authService.deleteUser(user.id!).subscribe({
                    next: () => {
                        this.loadUsers();
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Deleted',
                            detail: 'User deleted successfully',
                            life: 3000
                        });
                    },
                    error: () => {
                        alert('Error deleting user');
                    }
                });
            }
        });
    }

    // Enable inline editing for a user
    enableEdit(user: User) {
        this.editingUser[user.id!] = true;
    }

    // Cancel inline editing
    cancelEdit(user: User) {
        this.editingUser[user.id!] = false;
        this.loadUsers(); // Reload to reset any changes
    }

    // Save inline edits
    saveInlineEdit(user: User) {
        this.authService.updateUser(user).subscribe({
            next: () => {
                this.editingUser[user.id!] = false;
                this.loadUsers();
                alert('User updated successfully');
            },
            error: (err) => {
                alert(err.error?.message || 'Error updating user');
            }
        });
    }

    // Check if user is being edited
    isEditing(user: User): boolean {
        return this.editingUser[user.id!] || false;
    }

    canEditUser(user: User): boolean {
        return this.canManageAdmins || user.role !== 'admin';
    }
}

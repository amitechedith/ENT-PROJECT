import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { AccessControl, AccessRole, AccessTab } from '../../../models/access-control.model';
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
    displayAccessDialog: boolean = false;
    editingUser: { [key: string]: boolean } = {}; // Track which user is being edited
    visibleUserPasswords: { [key: string]: boolean } = {};
    userForm!: FormGroup;
    currentUser: User | null = null;
    selectedAccessDoctor?: User;
    accessControls: AccessControl[] = [];
    accessRoles: Array<{ label: string; value: AccessRole }> = [
        { label: 'Reception', value: 'receptionist' },
        { label: 'Prescription', value: 'billing' }
    ];
    accessTabs: Array<{ label: string; value: AccessTab }> = [
        { label: 'Reception', value: 'reception' },
        { label: 'Doctor', value: 'doctor' },
        { label: 'Prescription', value: 'billing' },
        { label: 'History', value: 'history' }
    ];
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
        this.loadAccessControls();
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
            doctorTimings: [''],
            defaultConsultationFee: [500],
            assignedDoctorId: ['']
        }, { validators: this.passwordMatchValidator });

        this.userForm.get('role')?.valueChanges.subscribe(() => this.updateRoleFieldValidators());
        this.updateRoleFieldValidators();
    }

    get canManageAdmins(): boolean {
        return this.currentUser?.role === 'admin';
    }

    get canManageAccessControls(): boolean {
        return this.currentUser?.role === 'admin' || this.currentUser?.role === 'doctor';
    }

    get availableRoles() {
        return this.canManageAdmins
            ? this.roles
            : this.roles.filter(role => role.value !== 'admin');
    }

    get doctorOptions(): Array<{ label: string; value: string }> {
        if (this.currentUser?.role === 'doctor') {
            return [{ label: this.currentUser.fullName, value: this.currentUser.id }];
        }

        return this.allUsers
            .filter(user => user.role === 'doctor')
            .map(user => ({ label: user.fullName, value: user.id }));
    }

    displayRoleLabel(role: string): string {
        return role === 'billing' ? 'Prescription' : role;
    }

    getAssignedDoctorName(user: User): string {
        if (!user.assignedDoctorId) {
            return '-';
        }

        return this.allUsers.find(doctor => doctor.id === user.assignedDoctorId)?.fullName || '-';
    }

    isPasswordVisible(user: User): boolean {
        return !!user.id && !!this.visibleUserPasswords[user.id];
    }

    togglePasswordVisibility(user: User): void {
        if (!this.canManageAdmins || !user.id) {
            return;
        }

        this.visibleUserPasswords[user.id] = !this.visibleUserPasswords[user.id];
    }

    getPasswordDisplay(user: User): string {
        if (!user.password) {
            return '-';
        }

        return this.isPasswordVisible(user) ? user.password : '********';
    }

    getFeeInputValue(value: User['defaultConsultationFee']): number {
        const fee = Number(value);
        return Number.isFinite(fee) && fee > 0 ? fee : 500;
    }

    passwordMatchValidator(form: FormGroup) {
        const password = form.get('password');
        const confirmPassword = form.get('confirmPassword');
        return password && confirmPassword && password.value === confirmPassword.value ? null : { mismatch: true };
    }

    get isDoctorRole(): boolean {
        return this.userForm?.get('role')?.value === 'doctor';
    }

    get isStaffRole(): boolean {
        const role = this.userForm?.get('role')?.value;
        return role === 'receptionist' || role === 'billing';
    }

    private updateRoleFieldValidators() {
        const doctorFields = [
            'doctorTitle',
            'doctorRegistrationNumber',
            'doctorClinicAddress',
            'doctorClinicPhone',
            'doctorEmail',
            'doctorTimings',
            'defaultConsultationFee'
        ];

        doctorFields.forEach(fieldName => {
            const control = this.userForm.get(fieldName);
            if (!control) {
                return;
            }

            if (this.isDoctorRole) {
                if (fieldName === 'doctorEmail') {
                    control.setValidators([Validators.required, Validators.email]);
                } else if (fieldName === 'defaultConsultationFee') {
                    control.setValidators([Validators.required, Validators.min(1)]);
                } else {
                    control.setValidators([Validators.required]);
                }
            } else {
                control.clearValidators();
                control.setValue('');
            }

            control.updateValueAndValidity({ emitEvent: false });
        });

        const assignedDoctorControl = this.userForm.get('assignedDoctorId');
        if (assignedDoctorControl) {
            if (this.isStaffRole) {
                assignedDoctorControl.setValidators([Validators.required]);
                if (!assignedDoctorControl.value && this.doctorOptions.length === 1) {
                    assignedDoctorControl.setValue(this.doctorOptions[0].value, { emitEvent: false });
                }
            } else {
                assignedDoctorControl.clearValidators();
                assignedDoctorControl.setValue('', { emitEvent: false });
            }
            assignedDoctorControl.updateValueAndValidity({ emitEvent: false });
        }
    }

    isInvalid(fieldName: string): boolean {
        const control = this.userForm.get(fieldName);
        return !!control && control.invalid && (control.touched || control.dirty);
    }

    loadUsers() {
        this.authService.getUsers().subscribe(users => {
            this.allUsers = users;
            this.users = this.filterVisibleUsers(users);
            this.updateRoleFieldValidators();
        });
    }

    loadAccessControls() {
        this.authService.ensureAccessControlsLoaded().subscribe(controls => {
            this.accessControls = controls.map(control => ({ ...control }));
        });
    }

    private filterVisibleUsers(users: User[]): User[] {
        if (this.canManageAdmins) {
            return users;
        }

        if (this.currentUser?.role === 'doctor') {
            return users.filter(user =>
                user.role !== 'admin'
                && (user.id === this.currentUser?.id || user.assignedDoctorId === this.currentUser?.id)
            );
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
                doctorTimings: user.doctorTimings || '',
                defaultConsultationFee: this.getFeeInputValue(user.defaultConsultationFee),
                assignedDoctorId: user.assignedDoctorId || ''
            });
        } else {
            // Create Mode
            this.userForm.reset({ role: 'doctor', defaultConsultationFee: 500 });
            this.userForm.get('id')?.setValue(null);
        }

        if (!this.canManageAdmins && this.userForm.get('role')?.value === 'admin') {
            this.userForm.get('role')?.setValue('doctor');
        }

        this.updateRoleFieldValidators();
    }

    showAccessControl(user: User) {
        if (!this.canManageAccessControls || user.role !== 'doctor') {
            return;
        }

        this.selectedAccessDoctor = user;
        this.accessControls = this.authService.getAccessControlsForDoctor(user.id).map(control => ({ ...control }));
        this.displayAccessDialog = true;
    }

    isAccessAllowed(targetRole: AccessRole, tabKey: AccessTab): boolean {
        return !!this.accessControls.find(control =>
            control.doctorId === this.selectedAccessDoctor?.id
            && control.targetRole === targetRole
            && control.tabKey === tabKey
            && control.isAllowed
        );
    }

    setAccessAllowed(targetRole: AccessRole, tabKey: AccessTab, isAllowed: boolean): void {
        const doctorId = this.selectedAccessDoctor?.id || '';
        const existingControl = this.accessControls.find(control =>
            control.doctorId === doctorId
            && control.targetRole === targetRole
            && control.tabKey === tabKey
        );

        if (existingControl) {
            existingControl.isAllowed = isAllowed;
            return;
        }

        this.accessControls.push({ doctorId, targetRole, tabKey, isAllowed });
    }

    saveAccessControls() {
        if (!this.selectedAccessDoctor) {
            return;
        }

        const controlsToSave = this.authService.mergeDoctorAccessControls(this.selectedAccessDoctor.id, this.accessControls)
            .filter(control => control.doctorId === this.selectedAccessDoctor?.id);
        this.authService.updateAccessControls(controlsToSave).subscribe({
            next: (controls) => {
                this.accessControls = this.authService.getAccessControlsForDoctor(this.selectedAccessDoctor!.id)
                    .map(control => ({ ...control }));
                this.displayAccessDialog = false;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Access controls updated',
                    life: 3000
                });
            },
            error: (err) => {
                alert(err.error?.message || 'Error updating access controls');
            }
        });
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
                doctorTimings: formVal.role === 'doctor' ? formVal.doctorTimings : undefined,
                defaultConsultationFee: formVal.role === 'doctor' ? Number(formVal.defaultConsultationFee || 0) : undefined,
                assignedDoctorId: ['receptionist', 'billing'].includes(formVal.role) ? formVal.assignedDoctorId : undefined
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

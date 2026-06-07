export interface User {
    id: string;
    username: string;
    password?: string; // Optional for security when passing around
    fullName: string;
    mobile?: string;
    role: 'admin' | 'doctor' | 'receptionist' | 'billing';
    doctorTitle?: string;
    doctorRegistrationNumber?: string;
    doctorClinicAddress?: string;
    doctorClinicPhone?: string;
    doctorEmail?: string;
    doctorTimings?: string;
}

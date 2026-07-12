export type AccessRole = 'receptionist' | 'billing';
export type AccessTab = 'reception' | 'doctor' | 'billing' | 'history';

export interface AccessControl {
    doctorId: string;
    targetRole: AccessRole;
    tabKey: AccessTab;
    isAllowed: boolean;
}

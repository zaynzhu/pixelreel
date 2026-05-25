export type SettingsFieldType = 'text' | 'boolean' | 'password';

export interface SettingsField {
  key: string;
  value: string;
  sensitive: boolean;
  type: SettingsFieldType;
}

export interface SettingsCategory {
  key: string;
  labelZh: string;
  labelEn: string;
  fields: SettingsField[];
}

export interface SettingsResponse {
  categories: SettingsCategory[];
}

export interface SettingsSaveResponse {
  success: boolean;
  restartRequired: boolean;
}
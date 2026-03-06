export type AppToastInput = {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

export type AppToast = (input: AppToastInput) => void;

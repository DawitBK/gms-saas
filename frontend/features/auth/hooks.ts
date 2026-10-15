import { useMutation } from '@tanstack/react-query';
import { authApi } from './api';

export const useLogin = () =>
  useMutation({
    mutationFn: authApi.login,
  });

export const useRegister = () =>
  useMutation({
    mutationFn: authApi.register,
  });

export const useVerifyRegistration = () =>
  useMutation({
    mutationFn: authApi.verifyRegistration,
  });

export const useResendVerification = () =>
  useMutation({
    mutationFn: authApi.resendVerification,
  });

export const useUpdateRegistrationEmail = () =>
  useMutation({
    mutationFn: authApi.updateRegistrationEmail,
  });

export const useForgotPassword = () =>
  useMutation({
    mutationFn: authApi.forgotPassword,
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: authApi.resetPassword,
  });

export const useVerify2fa = () =>
  useMutation({
    mutationFn: authApi.verify2fa,
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: authApi.changePassword,
  });

export const useToggle2fa = () =>
  useMutation({
    mutationFn: authApi.toggle2fa,
  });

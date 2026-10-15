import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { sendSuccess } from '../../core/utils/helpers';
import { AuthResponseDTO } from './auth.dto';
import { appConfig } from '../../config/app.config';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { attachCsrfCookie, clearCsrfCookie } from '../../shared/middleware/csrf.middleware';
import { mapPublicAuthResponse } from './auth.dto';
import { authService as defaultAuthService } from '../../composition';

/**
 * Auth Controller
 * 
 * Handles HTTP requests for user authentication including login,
 * registration, token refresh, and session termination.
 * Coordinates with AuthService to process the logic.
 */
export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService = defaultAuthService) {
    this.authService = authService;
  }

  /**
   * login
   * Authenticates a user using email and password, establishing a session.
   * Attaches a secure HTTP-only refresh token cookie and issues an access token.
   */
  public login = async (req: Request, res: Response): Promise<void> => {
    const result: AuthResponseDTO = await this.authService.login(req.body.email, req.body.password, this.getSessionMetadata(req));
    if (result.refreshToken) {
      this.attachRefreshCookie(res, result.refreshToken);
    }
    attachCsrfCookie(res);
    sendSuccess(res, mapPublicAuthResponse(result));
  };

  public register = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.register(req.body, this.getSessionMetadata(req));
    // We no longer attach cookies or return tokens here; verification is now required.
    sendSuccess(res, {
      message: 'Registration successful. Please check your email for the verification code.',
      email: req.body.email,
      otpExpiresAt: result.otpExpiresAt,
    }, 201);
  };

  /**
   * verify
   * Validates a registration OTP and establishes the initial user session.
   */
  public verify = async (req: Request, res: Response): Promise<void> => {
    const { email, otp } = req.body;
    const result: AuthResponseDTO = await this.authService.verifyRegistration(email, otp, this.getSessionMetadata(req));
    
    if (result.refreshToken) {
      this.attachRefreshCookie(res, result.refreshToken);
    }
    attachCsrfCookie(res);
    sendSuccess(res, mapPublicAuthResponse(result));
  };

  /**
   * refresh
   * Renews the active session to provide a fresh access token without re-authentication.
   * Validates the validity of the provided HTTP-only refresh token.
   */
  public refresh = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = this.extractRefreshToken(req);
    const result: AuthResponseDTO = await this.authService.refreshSession(refreshToken, this.getSessionMetadata(req));
    if (result.refreshToken) {
      this.attachRefreshCookie(res, result.refreshToken);
    }
    attachCsrfCookie(res);
    sendSuccess(res, mapPublicAuthResponse(result));
  };

  public logout = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = this.extractRefreshToken(req, false);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    // Path must match attachRefreshCookie exactly or the browser keeps the
    // cookie and sign-out silently fails to clear it.
    res.clearCookie('gms_refresh_token', { path: appConfig.refreshCookiePath });
    clearCsrfCookie(res);
    sendSuccess(res, { loggedOut: true });
  };

  /**
   * me
   * Endpoint to quickly verify if the current user session is active and valid.
   * Used by frontend clients during initial load.
   */
  public me = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = this.extractRefreshToken(req, false);
    if (!refreshToken) {
      throw new AppError('No valid session token', ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    const user = await this.authService.verifySession(refreshToken);
    if (!user) {
      throw new AppError('Invalid or expired session', ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    const officeId = await (new (require('./auth.repository').AuthRepository)()).resolveUserOfficeId(user.id);
    
    sendSuccess(res, {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        roles: (user as any).roles?.map((r: any) => r.name) || [],
        office_id: officeId,
        requires_password_change: user.requires_password_change,
      }
    });
  };

public forgotPassword = async (req: Request, res: Response): Promise<void> => {
  await this.authService.requestPasswordReset(req.body.email);
  sendSuccess(res, { message: 'If an account exists, a reset code has been sent.' });
};

public resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { email, otp, password } = req.body;
  await this.authService.resetPassword(email, otp, password);
  sendSuccess(res, { message: 'Password has been reset successfully.' });
};

public resendVerification = async (req: Request, res: Response): Promise<void> => {
  const result = await this.authService.resendVerification(req.body.email);
  sendSuccess(res, { message: 'If this email is pending verification, a new code has been sent.', ...result });
};

public updateRegistrationEmail = async (req: Request, res: Response): Promise<void> => {
  const result = await this.authService.updateRegistrationEmail(
    req.body.email,
    req.body.newEmail,
    req.body.password,
  );
  sendSuccess(res, { message: 'Verification code sent to the new email address.', ...result });
};

public changePassword = async (req: Request, res: Response): Promise<void> => {
  const { old_password, new_password } = req.body;
  const userId = (req as any).user.id;
  await this.authService.changePassword(userId, old_password, new_password);
  sendSuccess(res, { message: 'Password updated successfully.' });
};

public verifyPassword = async (req: Request, res: Response): Promise<void> => {
  const { password } = req.body;
  const userId = (req as any).user.id;
  await this.authService.verifyPassword(userId, password);
  sendSuccess(res, { verified: true });
};

public verify2fa = async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;
  const result: AuthResponseDTO = await this.authService.verifyTwoFactor(email, otp, this.getSessionMetadata(req));
  if (result.refreshToken) {
    this.attachRefreshCookie(res, result.refreshToken);
  }
  attachCsrfCookie(res);
  sendSuccess(res, mapPublicAuthResponse(result));
};

public toggleTwoFactor = async (req: Request, res: Response): Promise<void> => {
  const { enabled } = req.body;
  const userId = (req as any).user.id;
  await this.authService.toggleTwoFactor(userId, enabled);
  sendSuccess(res, { message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}.` });
};

  private attachRefreshCookie(res: Response, refreshToken: string) {
    res.cookie('gms_refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: appConfig.isProduction,
      // See appConfig.refreshCookiePath (P1-11) — narrowed off the shared origin
      // root so sibling systems on portal.examplecorp.com never receive it.
      path: appConfig.refreshCookiePath,
      maxAge: this.calculateCookieMaxAge(appConfig.jwt.refreshExpiresIn),
    });
  }

  private getSessionMetadata(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  private extractRefreshToken(req: Request): string;
  private extractRefreshToken(req: Request, required: true): string;
  private extractRefreshToken(req: Request, required: false): string | undefined;
  private extractRefreshToken(req: Request, required: boolean = true) {
    const cookieHeader = req.headers.cookie ?? '';
    const cookieToken = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('gms_refresh_token='))
      ?.split('=')
      .slice(1)
      .join('=');

    const refreshToken = cookieToken || req.body?.refreshToken;
    if (!refreshToken && required) {
      throw new AppError('Refresh token is required', ErrorCodes.INVALID_INPUT, 400);
    }
    return refreshToken as string | undefined;
  }

  private calculateCookieMaxAge(expiresIn: string) {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit];
  }
}

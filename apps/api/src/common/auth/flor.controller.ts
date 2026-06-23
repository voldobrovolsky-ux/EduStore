import { Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from './public.decorator';
import { FlorService, type SessionUser } from './flor.service';

// Эндпоинты RP (ADR-0005): /api/auth/flor/login|callback|me|logout|backchannel-logout
@Controller('auth/flor')
export class FlorController {
  constructor(private readonly flor: FlorService) {}

  @Public()
  @Get('login')
  async login(@Res() res: Response): Promise<void> {
    const { url, tx } = await this.flor.buildAuthUrl();
    // PKCE/state/nonce — в короткоживущем httpOnly cookie (stateless tx)
    res.cookie('flor_tx', JSON.stringify(tx), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600_000, path: '/api/auth/flor' });
    res.redirect(url);
  }

  @Public()
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const txRaw = (req.cookies?.flor_tx as string) ?? '';
    if (!txRaw) {
      res.status(400).send('no auth transaction');
      return;
    }
    const { sid } = await this.flor.handleCallback(req, JSON.parse(txRaw));
    res.clearCookie('flor_tx', { path: '/api/auth/flor' });
    res.cookie('flor_sid', sid, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/' });
    res.redirect(process.env.WEB_ORIGIN ?? '/');
  }

  @Get('me')
  me(@Req() req: Request & { user?: SessionUser }): SessionUser {
    if (!req.user) throw new UnauthorizedException();
    return req.user;
  }

  @Public()
  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const url = await this.flor.buildLogoutUrl(req.cookies?.flor_sid as string | undefined);
    res.clearCookie('flor_sid', { path: '/' });
    res.redirect(url);
  }

  @Public()
  @Post('backchannel-logout')
  async backchannel(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = ((req.body as Record<string, unknown>)?.logout_token as string) ?? '';
    if (!token) {
      res.status(400).send('missing token');
      return;
    }
    try {
      await this.flor.handleBackchannel(token);
      res.status(200).send();
    } catch {
      res.status(400).send('invalid');
    }
  }
}

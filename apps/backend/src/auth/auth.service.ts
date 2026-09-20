import { normalizePhone } from '../onboarding/phone-verification.service.js';
import { OnboardingService } from '../onboarding/onboarding.service.js';
import { RegisterDto } from '../onboarding/onboarding.dto.js';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly onboarding: OnboardingService,
  ) {}

  async validateUser(identifier: string, pass: string): Promise<any> {
    if (typeof identifier !== 'string' || typeof pass !== 'string') throw new UnauthorizedException('Invalid credentials');
    identifier = identifier.trim();
    if (!identifier.includes('@')) identifier = normalizePhone(identifier);
    // Search by phone or email
    const user = await this.users.findOne({
      where: [{ phone: identifier }, { email: identifier.toLowerCase() }],
      select: ['id', 'phone', 'email', 'fullName', 'passwordHash', 'role', 'kycStatus', 'isActive'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      fullName: user.fullName,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        kycStatus: user.kycStatus,
      },
    };
  }

  async registerBorrower(dto: RegisterDto) {
    return this.login(await this.onboarding.saveProfile(dto));
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'realmoney_super_secret_jwt_key_development_2026'),
    });
  }

  async validate(payload: { sub: string; role: string; phone: string }) {
    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: ['id', 'phone', 'email', 'fullName', 'role', 'kycStatus', 'isActive'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account inactive or not found');
    }

    return user;
  }
}

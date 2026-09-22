import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { use } from 'passport';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  private async computeEffectiveRole(user: {
    id: string;
    role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  }): Promise<'ADMIN' | 'MANAGER' | 'EMPLOYEE'> {
    if (user.role === 'ADMIN') return 'ADMIN';
    if (user.role === 'MANAGER') return 'MANAGER';

    const activeManagedProject = await this.prisma.project.findFirst({
      where: {
        OR: [{ managerId: user.id }, { createdById: user.id }],
        isCompleted: false,
      },
    });

    return activeManagedProject ? 'MANAGER' : 'EMPLOYEE';
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessTokenSecret = process.env.JWT_SECRET || 'secretKeySuperSecret123';
    const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refreshSecretKeySuperSecret456';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessTokenSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshTokenSecret,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (user.isActive === false) {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa bởi quản trị viên.');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password || '');
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const effectiveRole = await this.computeEffectiveRole(user);
    const tokens = await this.generateTokens(user.id, user.email, effectiveRole);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatar || '',
        coverImage: user.coverImage || '',
        globalRole: effectiveRole,
        profession: user.profession,
        jobTitle: user.jobTitle,
        phone: user.phone,
        bio: user.bio,
        statusSignal: user.statusSignal,
        customStatus: user.customStatus,
      },
    };
  }
  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email này đã được sử dụng trong hệ thống');
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);

    const newUser = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        fullName: registerDto.fullName,
        phone: registerDto.phone || null,
        role: 'EMPLOYEE',
      },
    });
    const effectiveRole = await this.computeEffectiveRole(newUser);
    const tokens = await this.generateTokens(newUser.id, newUser.email, effectiveRole);
    await this.updateRefreshTokenHash(newUser.id, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        avatarUrl: newUser.avatar || '',
        coverImage: newUser.coverImage || '',
        globalRole: effectiveRole,
        profession: newUser.profession,
        jobTitle: newUser.jobTitle,
        phone: newUser.phone,
        bio: newUser.bio,
        statusSignal: newUser.statusSignal,
        customStatus: newUser.customStatus,
      },
    };
  }
  async refreshTokens(refreshToken: string) {
    let payload: any;
    try {
      const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refreshSecretKeySuperSecret456';
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh Token không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Truy cập bị từ chối. Token không khả thi.');
    }

    const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Refresh Token đã bị vô hiệu hóa hoặc không chính xác');
    }

    const effectiveRole = await this.computeEffectiveRole(user);
    const tokens = await this.generateTokens(user.id, user.email, effectiveRole);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatar || '',
        coverImage: user.coverImage || '',
        globalRole: effectiveRole,
        profession: user.profession,
        jobTitle: user.jobTitle,
        phone: user.phone,
        bio: user.bio,
        statusSignal: user.statusSignal,
        customStatus: user.customStatus,
      },
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Đăng xuất thành công' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại trong CSDL');
    }

    const effectiveRole = await this.computeEffectiveRole(user);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatar || '',
      coverImage: user.coverImage || '',
      globalRole: effectiveRole,
      profession: user.profession,
      jobTitle: user.jobTitle,
      phone: user.phone,
      bio: user.bio,
      statusSignal: user.statusSignal,
      customStatus: user.customStatus,
    };
  }

  async googleLogin(googleAuthDto: GoogleAuthDto) {
    let googleUser: { email: string; name: string; picture: string };

    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${googleAuthDto.googleToken}` },
      });

      if (!response.ok) {
        throw new UnauthorizedException('Xác thực Token Google không hợp lệ');
      }

      googleUser = (await response.json()) as {
        email: string;
        name: string;
        picture: string;
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Không thể xác thực thông tin tài khoản với Google');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (!user) {
      throw new UnauthorizedException('Gmail này không hợp lệ hoặc chưa được cấp quyền truy cập hệ thống');
    }

    const effectiveRole = await this.computeEffectiveRole(user);
    const tokens = await this.generateTokens(user.id, user.email, effectiveRole);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatar || '',
        coverImage: user.coverImage || '',
        globalRole: effectiveRole,
        profession: user.profession,
        jobTitle: user.jobTitle,
        phone: user.phone,
        bio: user.bio,
        statusSignal: user.statusSignal,
        customStatus: user.customStatus,
      },
    };
  }
}

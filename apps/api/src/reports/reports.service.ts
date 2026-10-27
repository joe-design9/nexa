import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reporterId: string, dto: any): Promise<any> {
    const targetType = String(dto.targetType);
    const targetId = String(dto.targetId);
    if (!['MESSAGE', 'USER', 'SERVER'].includes(targetType)) {
      throw new BadRequestException({ code: 'INVALID_TARGET_TYPE', message: 'Ungültiger Meldungstyp.' });
    }
    // Ziel muss existieren.
    if (targetType === 'MESSAGE') {
      const m = await this.prisma.message.findUnique({ where: { id: targetId } });
      if (!m) throw new NotFoundException({ code: 'TARGET_NOT_FOUND', message: 'Die gemeldete Nachricht existiert nicht.' });
    } else if (targetType === 'USER') {
      const u = await this.prisma.user.findUnique({ where: { id: targetId } });
      if (!u) throw new NotFoundException({ code: 'TARGET_NOT_FOUND', message: 'Der gemeldete Nutzer existiert nicht.' });
    } else {
      const s = await this.prisma.server.findUnique({ where: { id: targetId } });
      if (!s) throw new NotFoundException({ code: 'TARGET_NOT_FOUND', message: 'Der gemeldete Server existiert nicht.' });
    }
    if (dto.serverId) {
      const s = await this.prisma.server.findUnique({ where: { id: dto.serverId } });
      if (!s) throw new NotFoundException({ code: 'SERVER_NOT_FOUND', message: 'Server nicht gefunden.' });
    }
    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: targetType as never,
        targetId,
        serverId: dto.serverId ?? null,
        reason: String(dto.reason ?? '').slice(0, 1000),
      },
    });
    return report;
  }

  async list(status?: string): Promise<any[]> {
    return this.prisma.report.findMany({
      where: status ? { status: status as never } : {},
      include: { reporter: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async update(adminId: string, reportId: string, dto: any): Promise<any> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Meldung nicht gefunden.' });
    const status = String(dto.status ?? report.status);
    if (!['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'].includes(status)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Ungültiger Status.' });
    }
    return this.prisma.report.update({
      where: { id: reportId },
      data: { status: status as never, resolution: dto.resolution ?? report.resolution, handledById: adminId },
    });
  }
}

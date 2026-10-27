import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Persistentes Audit-Log (Server- und Plattform-Aktionen). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    actorId: string;
    action: string;
    serverId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    reason?: string | null;
    changes?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        serverId: input.serverId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        reason: input.reason ?? null,
        changes: (input.changes ?? undefined) as never,
      },
    });
  }
}

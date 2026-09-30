import { Injectable, Logger } from '@nestjs/common';
import {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  ConflictException,
  ResourceNotFoundException,
  FlexibleTimeWindowMode,
  ScheduleState,
} from '@aws-sdk/client-scheduler';

export type ReminderTriggerType = 'MORNING' | 'EVENING' | 'STREAK';

export type ReminderScheduleKind = 'morning' | 'evening' | 'streak';

export interface ReminderSqsPayload {
  userId: string;
  reminderId: string;
  type: ReminderTriggerType;
}

interface ScheduleDefinition {
  kind: ReminderScheduleKind;
  type: ReminderTriggerType;
  cron: string;
}

const SCHEDULES: ScheduleDefinition[] = [
  { kind: 'morning', type: 'MORNING', cron: 'cron(0 8 * * ? *)' },
  { kind: 'evening', type: 'EVENING', cron: 'cron(30 19 * * ? *)' },
  { kind: 'streak', type: 'STREAK', cron: 'cron(30 21 * * ? *)' },
];

function sqsUrlToArn(queueUrl: string): string {
  const match = queueUrl.match(
    /^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\/(\d+)\/([^/?]+)$/i,
  );
  if (!match) {
    return '';
  }

  return `arn:aws:sqs:${match[1]}:${match[2]}:${match[3]}`;
}

@Injectable()
export class EventBridgeSchedulerService {
  private readonly logger = new Logger(EventBridgeSchedulerService.name);
  private readonly client: SchedulerClient;
  private readonly groupName: string;
  private readonly queueArn: string;
  private readonly roleArn: string;
  private readonly enabled: boolean;

  constructor() {
    const region = process.env.AWS_REGION ?? '';
    this.groupName = process.env.AWS_SCHEDULER_GROUP_NAME ?? 'default';
    this.queueArn =
      process.env.AWS_SCHEDULER_TARGET_QUEUE_ARN ||
      sqsUrlToArn(process.env.AWS_SQS_NOTIFICATION_URL ?? '');
    this.roleArn = process.env.AWS_SCHEDULER_ROLE_ARN ?? '';
    this.enabled = Boolean(region && this.queueArn && this.roleArn);

    if (!this.enabled) {
      this.logger.warn(
        'EventBridge Scheduler is not fully configured. Set AWS_REGION, AWS_SCHEDULER_ROLE_ARN, and AWS_SQS_NOTIFICATION_URL (or AWS_SCHEDULER_TARGET_QUEUE_ARN).',
      );
    }

    this.client = new SchedulerClient({
      region: region || undefined,
    });
  }

  scheduleName(userId: string, kind: ReminderScheduleKind): string {
    return `user-${userId}-${kind}`;
  }

  async upsertUserSchedules(
    userId: string,
    reminderId: string,
    timezone: string,
    state: ScheduleState = ScheduleState.ENABLED,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    for (const schedule of SCHEDULES) {
      await this.upsertSchedule(userId, reminderId, timezone, schedule, state);
    }
  }

  async disableUserSchedules(
    userId: string,
    reminderId: string,
    timezone: string,
  ): Promise<void> {
    await this.upsertUserSchedules(
      userId,
      reminderId,
      timezone,
      ScheduleState.DISABLED,
    );
  }

  async deleteUserSchedules(userId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    for (const schedule of SCHEDULES) {
      await this.deleteSchedule(this.scheduleName(userId, schedule.kind));
    }
  }

  private async upsertSchedule(
    userId: string,
    reminderId: string,
    timezone: string,
    schedule: ScheduleDefinition,
    state: ScheduleState,
  ): Promise<void> {
    const name = this.scheduleName(userId, schedule.kind);
    const input = this.buildScheduleInput(
      name,
      userId,
      reminderId,
      timezone,
      schedule,
      state,
    );

    try {
      await this.client.send(new CreateScheduleCommand(input));
      this.logger.debug(`Created EventBridge schedule ${name}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        await this.client.send(new UpdateScheduleCommand(input));
        this.logger.debug(`Updated EventBridge schedule ${name}`);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to upsert schedule ${name}: ${message}`);
      throw error;
    }
  }

  private async deleteSchedule(name: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteScheduleCommand({
          Name: name,
          GroupName: this.groupName,
        }),
      );
      this.logger.debug(`Deleted EventBridge schedule ${name}`);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete schedule ${name}: ${message}`);
      throw error;
    }
  }

  private buildScheduleInput(
    name: string,
    userId: string,
    reminderId: string,
    timezone: string,
    schedule: ScheduleDefinition,
    state: ScheduleState,
  ) {
    const payload: ReminderSqsPayload = {
      userId,
      reminderId,
      type: schedule.type,
    };

    return {
      Name: name,
      GroupName: this.groupName,
      ScheduleExpression: schedule.cron,
      ScheduleExpressionTimezone: timezone,
      FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
      State: state,
      Target: {
        Arn: this.queueArn,
        RoleArn: this.roleArn,
        Input: JSON.stringify(payload),
      },
    };
  }
}

import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { SessionUser } from '../../common/auth/flor.service';
import { StructureService } from './structure.service';
import { AddSubGroupDto, AssignDto, CreateClassDto, CreateSubjectDto } from './dto';

@Controller('structure')
export class StructureController {
  constructor(private readonly svc: StructureService) {}

  private org(u?: SessionUser): string | null {
    return u?.orgId ?? null;
  }

  // классы / подгруппы (админ)
  @Get('classes')
  listClasses(@CurrentUser() u?: SessionUser) {
    return this.svc.listClasses(this.org(u));
  }
  @Post('classes')
  createClass(@Body() body: CreateClassDto, @CurrentUser() u?: SessionUser) {
    return this.svc.createClass(this.org(u), body);
  }
  @Delete('classes/:id')
  deleteClass(@Param('id') id: string) {
    return this.svc.deleteClass(id);
  }
  @Post('classes/:id/subgroups')
  addSubGroup(@Param('id') id: string, @Body() body: AddSubGroupDto) {
    return this.svc.addSubGroup(id, body);
  }
  @Delete('subgroups/:id')
  deleteSubGroup(@Param('id') id: string) {
    return this.svc.deleteSubGroup(id);
  }

  // дисциплины (методист/завуч)
  @Get('subjects')
  listSubjects(@CurrentUser() u?: SessionUser) {
    return this.svc.listSubjects(this.org(u));
  }
  @Post('subjects')
  createSubject(@Body() body: CreateSubjectDto, @CurrentUser() u?: SessionUser) {
    return this.svc.createSubject(this.org(u), body);
  }
  @Delete('subjects/:id')
  deleteSubject(@Param('id') id: string) {
    return this.svc.deleteSubject(id);
  }

  // распределение учителей (завуч)
  @Get('teachers')
  listTeachers(@CurrentUser() u?: SessionUser) {
    return this.svc.listTeachers(this.org(u));
  }
  @Post('assignments')
  assign(@Body() body: AssignDto) {
    return this.svc.assign(body);
  }
  @Delete('assignments/:id')
  unassign(@Param('id') id: string) {
    return this.svc.unassign(id);
  }

  // привязанные устройства (админ → Сеть устройств)
  @Get('devices')
  listDevices(@CurrentUser() u?: SessionUser) {
    return this.svc.listDevices(this.org(u));
  }
  @Delete('devices/:id')
  deleteDevice(@Param('id') id: string) {
    return this.svc.deleteDevice(id);
  }
}

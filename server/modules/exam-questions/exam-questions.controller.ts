import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  ExamQuestion,
  KnowledgePointCardData,
  PaginatedResponse,
  HighFreqItem,
  SchoolQuestionGroup,
  YearQuestionGroup,
   YearQuestionOverview,
   SchoolQuestionOverview,
   SubjectQuestionOverview,
   ExamQuestionBrief,
  QuestionReviewDetail,
} from '../../shared/api.interface';
import { ExamQuestionsService } from './exam-questions.service';
import {
  ExamQuestionListQueryDto,
  HighFreqQueryDto,
  SubmitQuestionResultDto,
  UpdateQuestionCardDataDto,
  UpdateQuestionAnswerDto,
  UpdateQuestionTextDto,
  UpdateQuestionDifficultyDto,
  AddKnowledgePointDto,
  UpdateAnswerKeywordsDto,
  CreateExamQuestionDto,
} from './dto/exam-questions.dto';

@Controller('api/exam-questions')
export class ExamQuestionsController {
  constructor(
    private readonly examQuestionsService: ExamQuestionsService,
  ) {}

  @Get()
  async findList(
    @Query() query: ExamQuestionListQueryDto,
  ): Promise<PaginatedResponse<ExamQuestion>> {
    return this.examQuestionsService.findList(query);
  }

  @Post()
  async create(
    @Body() dto: CreateExamQuestionDto,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.create(dto);
  }

  @Get('high-freq')
  async getHighFreq(
    @Query() query: HighFreqQueryDto,
  ): Promise<HighFreqItem[]> {
    return this.examQuestionsService.getHighFreq(query);
  }

  @Get('high-freq-questions')
  async getHighFreqQuestions(
    @Query() query: HighFreqQueryDto & { page?: string; pageSize?: string },
  ): Promise<PaginatedResponse<import('../../shared/api.interface').HighFreqQuestion>> {
    return this.examQuestionsService.getHighFreqQuestions({
      ...query,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }

  @Get('sources')
  async getSources(): Promise<string[]> {
    return this.examQuestionsService.getAllSources();
  }

  @Get('by-school')
  async getBySchool(
    @Query('keyword') keyword?: string,
  ): Promise<SchoolQuestionOverview[]> {
    return this.examQuestionsService.getSchoolOverview(keyword);
  }

  @Get('by-school/:school/questions')
  async getSchoolQuestions(
    @Param('school') school: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
    return this.examQuestionsService.getQuestionsBySchool(
      decodeURIComponent(school),
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('by-year')
  async getByYear(
    @Query('subjectId') subjectId?: string,
  ): Promise<YearQuestionOverview[]> {
    return this.examQuestionsService.getYearOverview(subjectId);
  }

  @Get('by-subject')
  async getBySubject(): Promise<SubjectQuestionOverview[]> {
    return this.examQuestionsService.getSubjectOverview();
  }

  @Get('by-subject/:subjectId/questions')
  async getSubjectQuestions(
    @Param('subjectId') subjectId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
    return this.examQuestionsService.getQuestionsBySubject(
      subjectId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('by-year/:year/questions')
  async getYearQuestions(
    @Param('year') year: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
    return this.examQuestionsService.getQuestionsByYear(
      parseInt(year, 10),
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ExamQuestion> {
    return this.examQuestionsService.findOne(id);
  }

  @Get(':id/review-detail')
  async getReviewDetail(
    @Param('id') id: string,
  ): Promise<QuestionReviewDetail> {
    return this.examQuestionsService.getReviewDetail(id);
  }

  @Post(':id/submit')
  async submit(
    @Param('id') id: string,
    @Body() dto: SubmitQuestionResultDto,
  ): Promise<{ success: boolean }> {
    return this.examQuestionsService.submit(id, dto);
  }

  @Patch(':id/card-data')
  async updateCardData(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionCardDataDto,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.updateCardData(
      id,
      dto.cardData as KnowledgePointCardData,
    );
  }

  @Patch(':id/answer')
  async updateAnswer(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionAnswerDto,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.updateAnswer(id, dto.answer ?? '');
  }

  @Patch(':id/question-text')
  async updateQuestionText(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionTextDto,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.updateQuestionText(
      id,
      dto.questionText,
    );
  }

  @Patch(':id/difficulty')
  async updateDifficulty(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDifficultyDto,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.updateDifficulty(id, dto.difficulty);
  }

  @Post(':id/knowledge-points')
  async addKnowledgePoint(
    @Param('id') id: string,
    @Body() dto: AddKnowledgePointDto,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.addKnowledgePoint(id, dto.knowledgePointId);
  }

  @Delete(':id/knowledge-points/:knowledgePointId')
  async removeKnowledgePoint(
    @Param('id') id: string,
    @Param('knowledgePointId') knowledgePointId: string,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.removeKnowledgePoint(id, knowledgePointId);
  }

  @Patch(':id/answer-keywords')
  async updateAnswerKeywords(
    @Param('id') id: string,
    @Body() dto: UpdateAnswerKeywordsDto,
  ): Promise<ExamQuestion> {
    return this.examQuestionsService.updateAnswerKeywords(
      id,
      dto.answerKeywords,
    );
  }
}

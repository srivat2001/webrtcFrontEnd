import { Routes } from '@angular/router';

import { provideRouter } from '@angular/router';
import { MainComponent } from './components/main/main.component';
import { AnswerComponent } from './components/answer/answer.component';
import { Stacktrace } from './components/stacktrace/stacktrace';

export const routes: Routes = [
  { path: 'main', component: MainComponent, data: { animation: 'main' } },
  { path: 'answer', component: AnswerComponent, data: { animation: 'answer' } },
  { path: 'stacktrace', component: Stacktrace, data: { animation: 'stacktrace' } },
  { path: '', redirectTo: 'main', pathMatch: 'full' },
  { path: '**', redirectTo: 'main' },
];

export const appRoutingProviders = [provideRouter(routes)];

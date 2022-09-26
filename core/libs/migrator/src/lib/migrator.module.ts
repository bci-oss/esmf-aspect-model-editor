import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialogModule} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {RouterModule, Routes} from '@angular/router';
import {
  StartMigratingComponent,
  MigratorComponent,
  LoadingMigratingComponent,
  VersionMigrationComponent,
  MigrationSuccessComponent,
  MigrationStatusComponent,
} from './components';

const routes: Routes = [
  {path: '', component: StartMigratingComponent, outlet: 'migrator'},
  {path: 'migrating', component: LoadingMigratingComponent, outlet: 'migrator'},
  {path: 'status', component: MigrationStatusComponent, outlet: 'migrator'},
  {path: 'increase-version', component: VersionMigrationComponent, outlet: 'migrator'},
  {path: 'migration-success', component: MigrationSuccessComponent, outlet: 'migrator'},
];

@NgModule({
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatCheckboxModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    RouterModule.forChild(routes),
  ],
  declarations: [
    StartMigratingComponent,
    MigratorComponent,
    LoadingMigratingComponent,
    VersionMigrationComponent,
    MigrationSuccessComponent,
    MigrationStatusComponent,
  ],
})
export class MigratorModule {}

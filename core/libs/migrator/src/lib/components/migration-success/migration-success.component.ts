import {Component} from '@angular/core';
import {MigratorService} from '../../migrator.service';

@Component({
  selector: 'ame-migration-success',
  templateUrl: './migration-success.component.html',
  styleUrls: ['./migration-success.component.scss'],
})
export class MigrationSuccessComponent {
  constructor(private migratorService: MigratorService) {}

  closeModal() {
    this.migratorService.dialogRef.close();
  }
}

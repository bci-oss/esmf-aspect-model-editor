import {Component, OnInit} from '@angular/core';
import {NamespaceStatus} from '@ame/api';
import {MigratorService} from '../../migrator.service';
import {Router} from '@angular/router';

@Component({
  selector: 'ame-migration-status',
  templateUrl: './migration-status.component.html',
  styleUrls: ['./migration-status.component.scss'],
})
export class MigrationStatusComponent implements OnInit {
  public migrationStatus: NamespaceStatus[] = [];
  public filteredErrorFiles = {};
  public hasErrors = false;

  constructor(public migratorService: MigratorService, private router: Router) {}

  ngOnInit(): void {
    this.migrationStatus = history.state.data?.namespaces || [];
    this.hasErrors = this.migrationStatus.length <= 0;

    for (const status of this.migrationStatus) {
      for (const fileStatus of status.files) {
        if (!fileStatus.success) {
          this.hasErrors = true;

          if (!this.filteredErrorFiles[status.namespace]) {
            this.filteredErrorFiles[status.namespace] = [fileStatus.name];
          } else {
            this.filteredErrorFiles[status.namespace].push(fileStatus.name);
          }
        }
      }
    }
  }

  increaseVersion() {
    if (this.migratorService.increaseNamespaceVersion) {
      this.router.navigate([{outlets: {migrator: 'increase-version'}}]);
    }
  }

  closeDialog() {
    this.migratorService.dialogRef.close();
  }
}

import {MigratorApiService} from '@ame/api';
import {EditorService} from '@ame/editor';
import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {catchError, map, of, switchMap} from 'rxjs';

@Component({
  selector: 'ame-loading-migrating',
  templateUrl: './loading-migrating.component.html',
  styleUrls: ['./loading-migrating.component.scss'],
})
export class LoadingMigratingComponent implements OnInit {
  constructor(private migratorApiService: MigratorApiService, private editorService: EditorService, private router: Router) {}

  ngOnInit(): void {
    this.migratorApiService
      .migrateWorkspace()
      .pipe(
        switchMap(data => this.editorService.loadExternalModels().pipe(map(() => data))),
        catchError(() => of(null))
      )
      .subscribe(data => {
        this.router.navigate([{outlets: {migrator: 'status'}}], {state: {data}});
      });
  }
}

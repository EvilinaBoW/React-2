import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  template: `
    <div style="padding: 20px; font-family: sans-serif;">
      <h2>Аналитика DWH и Управление Складом (Angular)</h2>
      
      <h3>OLTP: Быстрое списание</h3>
      <button (click)="sellMedicine(1)">Списать 1 ед. Аспирина</button>
      
      <h3>DWH: Отчет по дефектуре (нехватке) спроса</h3>
      <ul>
        <li *ngFor="let item of report">
          Группа: <b>{{item.farmGroup}}</b> | Продано: {{item.unitsSold}} шт. | 
          <span style="color: red;">Отказы (дефектура): {{item.defecturaCount}} раз(а)</span>
        </li>
      </ul>
    </div>
  `
})
export class AppComponent implements OnInit {
  report: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<any[]>('http://localhost:5000/api/dwh').subscribe(data => this.report = data);
  }

  sellMedicine(id: number) {
    this.http.post('http://localhost:5000/api/sell?medicineId=' + id + '&qty=1', {}).subscribe();
  }
}

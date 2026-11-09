import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface DwhRecord {
  pharmaGroup: string;
  demandQuantity: number;
  defectureCount: number;
  lostRevenue: number;
}

@Component({
  selector: 'app-dwh-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dwh-dashboard.component.html',
  styles: [`
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background-color: #f4f4f4; }
    .high-defecture { color: #d9534f; font-weight: bold; }
  `]
})
export class DwhDashboardComponent implements OnInit {
  // Данные, агрегированные из DWH контура
  public dwhData: DwhRecord[] = [];

  ngOnInit(): void {
    this.dwhData = [
      { pharmaGroup: 'Антибиотики', demandQuantity: 1200, defectureCount: 45, lostRevenue: 18900 },
      { pharmaGroup: 'Противовирусные', demandQuantity: 2500, defectureCount: 180, lostRevenue: 90000 },
      { pharmaGroup: 'Анальгетики', demandQuantity: 4300, defectureCount: 12, lostRevenue: 1800 },
      { pharmaGroup: 'Антикоагулянты', demandQuantity: 600, defectureCount: 85, lostRevenue: 26350 }
    ];
  }
}

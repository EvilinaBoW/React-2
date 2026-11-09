using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using System.Collections.Generic;
using System.Linq;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(); // Разрешаем фронтенду подключаться
var app = builder.Build();
app.UseCors(policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());

var incompatibilityKV = new Dictionary<int, int> { { 1, 2 } };

var dwhAnalytics = new List<object>
{
    new { FarmGroup = "Антикоагулянты", UnitsSold = 150, DefecturaCount = 45 },
    new { FarmGroup = "Анальгетики", UnitsSold = 500, DefecturaCount = 5 }
};

// 1. КВ: Проверка несовместимости в чеке
app.MapPost("/api/check", (List<int> medicineIds) =>
{
    bool hasConflict = medicineIds.Contains(1) && medicineIds.Contains(2);
    var warnings = hasConflict ? new List<string> { "Аспирин и Варфарин вместе вызовут кровотечение!" } : new List<string>();
    return Results.Ok(new { IsCompatible = !hasConflict, Warnings = warnings });
});

// 2. OLTP: Проведение продажи / Списание со склада
app.MapPost("/api/sell", (int medicineId, int qty) =>
{
    return Results.Ok(new { Message = $"OLTP: Товар {medicineId} списан со склада в количестве {qty} шт." });
});

// 3. DWH: Получение отчета по дефектуре и спросу
app.MapGet("/api/dwh", () => Results.Ok(dwhAnalytics));

app.Run("http://localhost:5000");

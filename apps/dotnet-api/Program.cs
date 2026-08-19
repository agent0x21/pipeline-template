var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAuthorization();

app.MapControllers();

// ------------------------------------------------------------
// Health
// ------------------------------------------------------------

app.MapGet("/health", () =>
{
    return Results.Ok(new
    {
        status = "ok",
        service = "dotnet-api",
        timestamp = DateTimeOffset.UtcNow
    });
})
.WithName("HealthCheck")
.WithTags("Health");

// ------------------------------------------------------------
// API information
// ------------------------------------------------------------

app.MapGet("/api/info", () =>
{
    return Results.Ok(new
    {
        service = "dotnet-api",
        version = Environment.GetEnvironmentVariable("APP_VERSION") ?? "development",
        environment = app.Environment.EnvironmentName,
        timestamp = DateTimeOffset.UtcNow
    });
})
.WithName("GetApiInfo")
.WithTags("System");

// ------------------------------------------------------------
// Example users API
// ------------------------------------------------------------

var users = new List<User>
{
    new(1, "Alice", "alice@example.com"),
    new(2, "Bob", "bob@example.com")
};

app.MapGet("/api/users", () =>
{
    return Results.Ok(users);
})
.WithName("GetUsers")
.WithTags("Users");

app.MapGet("/api/users/{id:int}", (int id) =>
{
    var user = users.FirstOrDefault(user => user.Id == id);

    return user is null
        ? Results.NotFound(new
        {
            error = "User not found",
            id
        })
        : Results.Ok(user);
})
.WithName("GetUser")
.WithTags("Users");

app.MapPost("/api/users", (CreateUserRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new
        {
            error = "Name is required"
        });
    }

    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return Results.BadRequest(new
        {
            error = "Email is required"
        });
    }

    var nextId = users.Count == 0
        ? 1
        : users.Max(user => user.Id) + 1;

    var user = new User(
        nextId,
        request.Name,
        request.Email
    );

    users.Add(user);

    return Results.Created($"/api/users/{user.Id}", user);
})
.WithName("CreateUser")
.WithTags("Users");

app.MapPut("/api/users/{id:int}", (int id, UpdateUserRequest request) =>
{
    var index = users.FindIndex(user => user.Id == id);

    if (index == -1)
    {
        return Results.NotFound(new
        {
            error = "User not found",
            id
        });
    }

    var updatedUser = new User(
        id,
        request.Name,
        request.Email
    );

    users[index] = updatedUser;

    return Results.Ok(updatedUser);
})
.WithName("UpdateUser")
.WithTags("Users");

app.MapDelete("/api/users/{id:int}", (int id) =>
{
    var user = users.FirstOrDefault(user => user.Id == id);

    if (user is null)
    {
        return Results.NotFound(new
        {
            error = "User not found",
            id
        });
    }

    users.Remove(user);

    return Results.NoContent();
})
.WithName("DeleteUser")
.WithTags("Users");

// ------------------------------------------------------------
// Echo / testing endpoint
// ------------------------------------------------------------

app.MapPost("/api/echo", (EchoRequest request) =>
{
    return Results.Ok(new
    {
        message = request.Message,
        receivedAt = DateTimeOffset.UtcNow
    });
})
.WithName("Echo")
.WithTags("Utilities");

app.Run();

record User(
    int Id,
    string Name,
    string Email
);

record CreateUserRequest(
    string Name,
    string Email
);

record UpdateUserRequest(
    string Name,
    string Email
);

record EchoRequest(
    string Message
);
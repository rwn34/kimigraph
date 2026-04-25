<?php
namespace App\Controllers;

use App\Models\User;

class Controller {
  public function show(): User {
    return new User();
  }
}
